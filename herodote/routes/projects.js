var express = require('express');
var router = express.Router();
var winston = require('winston');
var CONFIG = require('config');
var jwt = require('jsonwebtoken');
var bytes = require('bytes');
const uuidv4 = require('uuid/v4');

var monk = require('monk');
var db = monk(CONFIG.mongo.host + ':' + parseInt(CONFIG.mongo.port) + '/' + CONFIG.mongo.db);
var projects_db = db.get('projects');
var ban_db = db.get('bans');

var keystone = require('../lib/keystone');
var swift = require('../lib/swift');

const logger = winston.loggers.get('herodote');

const Prometheus = require('prom-client')
const projectsCreation = new Prometheus.Gauge({
  name: 'herodote_project_create',
  help: 'new projects creation',
  labelNames: ['type']
})

router.delete('/:ksProjectId/:id', function(req, res){
    if(! req.locals.logInfo.is_logged) {
        res.status(401).send('Not authorized');
        return;
    }
    let owner = req.locals.logInfo.session_user.uid;
    projects_db.findOne({"name": req.params.id, "owner": owner}).then( p => {
        if(!p) {
            res.status(404).send('project not found');
            res.end();
            return;
        }
        let bucket = req.locals.logInfo.session_user.uid + "_" + req.params.id;
        keystone.isToken(req).then((token) => {
                swift.delete(req.params.ksProjectId, bucket , token).then(del => {
                    if(del.bucket == null){
                        res.send({'project': p, 'error': true, 'msg': bucket + ' bucket must be emptied first, please delete files before'});
                        res.end();
                        return;
                    }
                    projects_db.remove({'_id': p._id}).then( delRes => {
                        res.send({'project': p, 'msg': 'deleted'})
                        res.end();
                        return;
                    });
                }).catch(err => {
                    res.send({'project': p, 'error': true, 'msg': del.msg});
                    res.end();
                    return;
                });
        });

    });
})

router.put('/:id/web', function(req, res, next) {
    if(! req.locals.logInfo.is_logged) {
        res.status(401).send('Not authorized');
        return;
    }
    projects_db.findOne({"name": req.params.id, "owner": req.locals.logInfo.session_user.uid}).then( p => {
        if (!p) {
            res.status(403).send('Not authorized');
            return
        }
        let activate = true
        if (p.web) {
            activate = false
            p.web = false;
        } else {
            p.web = true;
        }
        let bucket = req.locals.logInfo.session_user.uid + "_" + p.name;
        keystone.bind(null, null, null, null, true).then(adminToken => {
            let meta = {
                "X-Container-Read": "",
                "X-Container-Meta-Web-Listings": "",
                "X-Container-Meta-Web-Index": ""
            }
            if (activate) {
                meta = {
                    "X-Container-Read": ".r:*,.rlistings",
                    "X-Container-Meta-Web-Listings": "true",
                    "X-Container-Meta-Web-Index": "index.html"
                }
            }
            swift.setMetaPrimary(meta, p.ksProject, bucket, adminToken.ksToken).then(metaRes => {
                projects_db.update({'_id': p._id},{'$set': {'web': activate}}).then(updt => {
                    res.send({'msg': 'web site activation status: ' + activate, 'project': p})
                    res.end()
                    return
                })
            }).catch(err => {
                logger.error('failed to set web site' + bucket);
                res.status(500).send('An error occured:' + err);
                return
                
            });

        }).catch(err => {
            logger.error('failed to set web site ' + bucket);
            res.status(500).send('An error occured:' + err);
            return
        });;
    });
})


router.put('/:id/acls', function(req, res, next) {
    if(! req.locals.logInfo.is_logged) {
        res.status(401).send('Not authorized');
        return;
    }
    projects_db.findOne({"name": req.params.id, "owner": req.locals.logInfo.session_user.uid}).then( p => {
        if (!p) {
            res.status(403).send('Not authorized');
            return
        }
        let decoded = jwt.decode(p.ksToken);
        let ksToken = "";
        try {
            ksToken = jwt.sign(
              {
                  owner: decoded.owner,
                  container: decoded.container,
                  user: decoded.user,
                  account: decoded.account,
                  ro: decoded.ro

              },
              CONFIG.secrets.swift,
              {
                  jwtid: uuidv4()
              }
          );
        } catch(err) {
            logger.error('Error' + err)
        }
        if (ksToken == "") {
            res.status(500).send('An error occured');
            return           
        }
        if (decoded.jti !== undefined) {
            logger.warn('Ban token for ' + p.name + ':' + p.owner);
            ban_db.insert({id: decoded.jti}).then(ban => {
                projects_db.update({'_id': p._id},{'$set': {'ksToken': ksToken}}).then(updt => {
                    res.send({'msg': 'token regenerated, banning previous one'})
                    res.end()
                    return
                })
            })
        } else {
            projects_db.update({'_id': p._id},{'$set': {'ksToken': ksToken}}).then(updt => {
                res.send({'msg': 'token regenerated'})
                res.end()
                return
            })
        }
    });
})

router.put('/:id', function(req, res, next) {
    if(! req.locals.logInfo.is_logged) {
        res.status(401).send('Not authorized');
        return;
    }
    let project = req.body;
    project.owner = req.locals.logInfo.session_user.uid;
    let bucket = req.locals.logInfo.session_user.uid + "_" + project.name;
    for(let i=0;i < project.acls.length; i++) {
        let acl = project.acls[i];
        let userAcl = acl.name.split(':');
        let userName = userAcl[0];
        let ro = true;
        let prefix = "";
        if (userAcl.length > 1) {
            if(userAcl[1] == 'rw') {
                ro = false;
            }
            if(userAcl.length > 2) {
                prefix = userAcl[2];
            }
        }
        if(acl.token == "") {
            let ksToken = "";
            try {
                ksToken = jwt.sign(
                {
                    owner: req.locals.logInfo.session_user.uid,
                    container: bucket,
                    user: userName,
                    account: "AUTH_" + project.ksProject,
                    ro: ro,
                    prefix: prefix

                },
                CONFIG.secrets.swift
            );
            } catch(err) {
                logger.error('Error' + err)
            }
            acl.token = ksToken;
            acl.name = userName;
            acl.ro = ro;
        }
    }
    projects_db.update(
        {name: req.params.id, owner: req.locals.logInfo.session_user.uid},
        project
    ).then( p => {
        if (!p) {
            res.status(404).send('project not found');
            return;
        }
        res.send({msg: 'project updated', 'project': project});
        res.end();
    }).catch(err => {
        res.status(500).send('an error occured ')
    })
})

router.post('/', function(req, res, next) {
    if(! req.locals.logInfo.is_logged) {
        res.status(401).send('Not authorized');
        return;
    }
    let newProject = req.body;
    if(!newProject.name || !newProject.ksProject){
        res.status(403).send('missing name or project');
        return;
    }
    newProject.owner = req.locals.logInfo.session_user.uid;
    pType = 'internal';
    if(req.locals.logInfo.session_user.external) {
        pType = 'external'
    }
    projectsCreation.inc({'type': pType});
    projects_db.findOne({"name": newProject.name, "owner": newProject.owner}).then( p => {
        if(p) {
            res.status(403).send('project already exists');
            return
        }

        let bucket = req.locals.logInfo.session_user.uid + "_" + newProject.name;
        let ksToken = "";
        try {
            ksToken = jwt.sign(
              {
                  owner: req.locals.logInfo.session_user.uid,
                  container: bucket,
                  user: req.locals.logInfo.session_user.uid,
                  account: "AUTH_" + newProject.ksProject,
                  ro: false

              },
              CONFIG.secrets.swift,
              {
                  jwtid: uuidv4()
              }
          );
        } catch(err) {
            logger.error('Error' + err)
        }
        newProject.ksToken = ksToken;
        // Create bucket
        keystone.isToken(req).then((token) => {
            swift.create(newProject.ksProject, bucket, token).then(bucketCreated => {
                // set quotas
                let quota = CONFIG.openstack.swift.quota;
                if(req.locals.logInfo.session_user.external) {
                    quota = CONFIG.openstack.swift.externalQuota;
                }
                keystone.bind(null, null, null, null, true).then(adminToken => {
                    let meta = {
                        "X-Container-Meta-Quota-Bytes": bytes(quota)
                    }
                    swift.setMeta(meta, newProject.ksProject, bucket, adminToken.ksToken).then(quotaRes => {
                    }).catch(err => logger.error('failed to set quota for project ' + bucket));                   
                }).catch(err => logger.error('failed to set quota for project ' + bucket));;


                projects_db.insert(newProject).then( result => {
                    res.send({project: newProject});
                    res.end();
                }).catch(err => {
                    logger.error(err);
                    res.status(500).send(err);
                });
            }).catch(err => {
                res.status(401).send(err);
            });
        });
    })

});

router.get('/', function(req, res, next) {
    if(! req.locals.logInfo.is_logged) {
        res.status(401).send('Not authorized');
        return;
    }
    projects_db.find({owner: req.locals.logInfo.session_user.uid}).then(projects => {
        res.send({projects: projects});
        res.end();
    }).catch(error => {
        logger.error('failed to get projects', error)
        res.send({projects: []});
        res.end();
    })
});

router.get('/:id', function(req, res, next) {
    if(! req.locals.logInfo.is_logged) {
        res.status(401).send('Not authorized');
        return;
    }
    projects_db.findOne({owner: req.locals.logInfo.session_user.uid, name: req.params.id}).then(project => {

        keystone.isToken(req).then((token) => {
            let bucket = req.locals.logInfo.session_user.uid + "_" + project.name;
            swift.meta(project.ksProject, bucket, token).then(meta => {
                res.send({project: project, meta: meta});
                res.end();
            }).catch(err => {
                console.log('failed to get project metadata: ' + err);
                res.send({project: project, meta: null});
                res.end();               
            });
        }).catch(err => {
            console.log('failed to get project metadata: ' + err);
            res.send({project: project, meta: null});
            res.end();
        });

    }).catch(error => {
        logger.error('failed to get project', error)
        res.send({project: null, meta: null});
        res.end();
    })
});


module.exports = router;