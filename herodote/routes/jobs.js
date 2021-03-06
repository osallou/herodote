var express = require('express');
var router = express.Router();
var winston = require('winston');
var CONFIG = require('config');
var jwt = require('jsonwebtoken');

var monk = require('monk');
var db = monk(CONFIG.mongo.host + ':' + parseInt(CONFIG.mongo.port) + '/' + CONFIG.mongo.db);
var jobs_db = db.get('jobs');
var projects_db = db.get('projects');

const logger = winston.loggers.get('herodote');

const Prometheus = require('prom-client');

var rabbit = require('../lib/rabbit');

const projectsRun = new Prometheus.Gauge({
    name: 'herodote_project_run',
    help: 'number of runs per project',
    labelNames: ['project']
})

router.get('/:project/:id', function(req, res){
    let user = null;
    if(! req.locals.logInfo.is_logged) {
        let authorization = req.headers['authorization'] || null;
        if (authorization) {
            let elts = authorization.split(' ');
            try {
                jwtToken = jwt.verify(elts[elts.length - 1], CONFIG.secrets.swift);
                console.log('token', jwtToken)
                user = jwtToken.user;
               
            } catch(err) {
                console.log('err', err)
                logger.warn('failed to decode jwt');
                jwtToken = null;
                res.status(401).send('Not authorized');
                return;
            }
        } else {
            res.status(401).send('Not authorized');
            return;
        }
    } else {
        user = req.locals.logInfo.session_user.uid;
    }
    jobs_db.findOne({'id': req.params.id, 'projectId': monk.id(req.params.project), 'user': user}).then(job => {
        if(!job) {
            res.status(404).send();
            return
        }
        res.send({'job': job})
    })
})


router.delete('/:project/:id', function(req, res){
    if(! req.locals.logInfo.is_logged) {
        res.status(401).send('Not authorized');
        return;
    }
    jobs_db.update({'id': req.params.id, 'projectId': monk.id(req.params.project), 'user': req.locals.logInfo.session_user.uid}, {'$set': {status: 4}}).then(job => {
        if(!job) {
            res.status(404).send();
            return
        }
        res.send({'id': req.params.id, 'msg': 'tagged as killed'})
    })
})

router.head('/:project', function(req, res){
    if(! req.locals.logInfo.is_logged) {
        res.status(401).send('Not authorized');
        return;
    }
    jobs_db.count(
        {
            'projectId': monk.id(req.params.project),
            'user': req.locals.logInfo.session_user.uid
        }
        ).then(nbjobs => {
            res.set('X-HERODOTE-JOBS', nbjobs);
            res.end();
    })
});

/*
Get all user jobs, whatever the project
*/
router.get('/', function(req, res){
    let user = null;
    if(! req.locals.logInfo.is_logged) {
        let authorization = req.headers['authorization'] || null;
        if (authorization) {
            let elts = authorization.split(' ');
            try {
                jwtToken = jwt.verify(elts[elts.length - 1], CONFIG.secrets.swift);
                user = jwtToken.user;
               
            } catch(err) {
                logger.warn('failed to decode jwt');
                jwtToken = null;
                res.status(401).send('Not authorized');
                return;
            }
        } else {
            res.status(401).send('Not authorized');
            return;
        }
    } else {
        user = req.locals.logInfo.session_user.uid;
    }
    // Limit number of results to 100 unless specified by query parameter ?limit=X
    // accepts also ?skip=X for pagination
    let limit = 100;
    if (req.query.limit) {
        try {
            limit = parseInt(req.query.limit);
        }
        catch(err) {
            logger.debug('invalid limit query parameter', req.query, err);
        }
    }
    let options = { limit : limit, sort : { start : -1 } };
    if (req.query.skip) {
        try {
            options['skip'] = parseInt(req.query.skip);
        } catch(err) {
            logger.debug('invalid skip query parameter', req.query, err);
        }
    }
    jobs_db.find(
        {
            'user': user
        },
        options
        ).then(jobs => {
        res.send({'jobs': jobs})
    })
})

/*
Get user jobs for project
*/
router.get('/:project', function(req, res){
    let user = null;
    if(! req.locals.logInfo.is_logged) {
        let authorization = req.headers['authorization'] || null;
        if (authorization) {
            let elts = authorization.split(' ');
            try {
                jwtToken = jwt.verify(elts[elts.length - 1], CONFIG.secrets.swift);
                user = jwtToken.user;
               
            } catch(err) {
                logger.warn('failed to decode jwt');
                jwtToken = null;
                res.status(401).send('Not authorized');
                return;
            }
        } else {
            res.status(401).send('Not authorized');
            return;
        }
    } else {
        user = req.locals.logInfo.session_user.uid;
    }
    // Limit number of results to 100 unless specified by query parameter ?limit=X
    // accepts also ?skip=X for pagination
    let limit = 100;
    if (req.query.limit) {
        try {
            limit = parseInt(req.query.limit);
        }
        catch(err) {
            logger.debug('invalid limit query parameter', req.query, err);
        }
    }
    let options = { limit : limit, sort : { start : -1 } };
    if (req.query.skip) {
        try {
            options['skip'] = parseInt(req.query.skip);
        } catch(err) {
            logger.debug('invalid skip query parameter', req.query, err);
        }
    }
    jobs_db.find(
        {
            'projectId': monk.id(req.params.project),
            'user': user
        },
        options
        ).then(jobs => {
        res.send({'jobs': jobs})
    })
})


const CREATED = 0;
const STARTED = 1;
const OVER = 2;
const ERROR = 3;
const KILLED = 4;

runHook = function(project, bucket, hook, filePath, caller) {
    return new Promise(function(resolve, reject){
        if (caller === null || caller === "") {
            caller = project.owner
        }
        let ts= new Date().getTime();
        let job = {
            id: bucket + '.' + hook.name + '.' + ts,
            user: project.owner,
            caller: caller,
            hook: hook,
            projectId: project._id,
            file: filePath,
            start: ts,
            begin: 0,
            end: 0,
            status: CREATED,
            code: -1
        }
        projectsRun.inc({project: bucket});
        logger.info("Run hook for " + project + ":" + bucket + ":" + filePath + " by " + caller);
        jobs_db.insert(job).then(j => {
            rabbit.sendMsg({'job': job, 'action': 'createJob'}).then(res => {
                resolve({job: job.id});
            }).catch(err => {
                logger.error('failed to submit job:' + job.id + ", " + err);
                reject({err: err})
            });

        })
    })
}

checkHooks = function(projectName, bucket, filePath, caller) {
    return new Promise(function(resolve, reject){
        // project = AUTH_ksProjectId
        // bucket = ownerName_projectName
        let ksProjectId = projectName.replace('AUTH_', '');
        let elts = bucket.split('_');
        let ownerName = elts[0];
        projectName = bucket.replace(ownerName + '_', '');
        projects_db.findOne({owner: ownerName, name: projectName}).then(p => {
            if(!p || !p.hooks) {
                reject('no hook')
            }
            let nbHook = 0;
            let hooksToRun = [];
            for(let i=0;i<p.hooks.length;i++) {
                // Check regexp, if ok submit job
                logger.debug('check '+p.hooks[i].regexp+' against ' + filePath)
                let regex = new RegExp(p.hooks[i].regexp);
                let hook = p.hooks[i];
                if(filePath.match(regex)) {
                    logger.debug('should exec hook on ' + filePath);
                    nbHook++;
                    hooksToRun.push(runHook(p, bucket, hook, filePath, caller))
                }
            }
            Promise.all(hooksToRun).then(results => {
                resolve({hooks: nbHook, jobs: results})
            }).catch(err => reject(err))
        }).catch(err => {
            reject(err)
        })

    })
}

// <project>/<container>/<path:filepath>', methods=['POST', 'PUT'])
router.post('/swift/:project/:bucket/*', function(req, res, next) {
    let tokens = CONFIG.openstack.swift.tokens.split(",");

    let token = req.headers['x-swift-token'] || null;
    if(tokens.indexOf(token) < 0){
        res.status(403).send('forbidden');
        return
    }
    let caller = req.headers['x-hero-user'] || null;

    let filePath = req.params[0];
    checkHooks(req.params.project, req.params.bucket, filePath, caller).then(resp => {
        res.send({'msg': 'done', 'run': resp})
        res.end()
        return
    }).catch(err => {
        logger.error('Failed to trigger hook:' + err)
        res.status(500).send('failed');
    })
    
})
router.put('/swift/:project/:bucket/*', function(req, res, next) {
    let tokens = CONFIG.openstack.swift.tokens.split(",");
    let token = req.headers['x-swift-token'] || null;
    if(tokens.indexOf(token) <= 0){
        res.status(403).send('forbidden');
        return
    }
    let caller = req.headers['x-hero-user'] || null;

    let filePath = req.params[0];
    checkHooks(req.params.project, req.params.bucket, filePath, caller).then(resp => {
        res.send({'msg': 'done', 'run': resp})
        res.end()
        return
    }).catch(err => {
        logger.error('Failed to trigger hook:' + err)
        res.status(500).send('failed');
    })
})

// Update job status
router.put('/:id/:status', function(req, res, next) {
    let status = parseInt(req.params.status);
    let data = {'status': status};
    if (status == 1) {
        data['begin'] = new Date().getTime()
    }    
    if (status == 2) {
        data['end'] = new Date().getTime()
    }
    jobs_db.update({id: req.params.id},{'$set': data}).then(j => {
        res.send({'msg': 'done'});
    })
})






module.exports = router;