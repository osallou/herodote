var express = require('express');
var router = express.Router();
var winston = require('winston');
var jwt = require('jsonwebtoken');
var CONFIG = require('config');
var Promise = require('promise');
var ldap = require('../lib/auth_ldap');
var fakeauth = require('../lib/auth_fake');
var oidcauth = require('../lib/auth_oidc');
var keystone = require('../lib/keystone');

const logger = winston.loggers.get('herodote');

const Prometheus = require('prom-client')
const authStat = new Prometheus.Gauge({
  name: 'herodote_auth',
  help: 'authentications',
  labelNames: ['type']
})

//var OidcClient = require('oidc-client-node');

var monk = require('monk');
var db = monk(CONFIG.mongo.host + ':' + parseInt(CONFIG.mongo.port) + '/' + CONFIG.mongo.db);
var projects_db = db.get('projects');
var users_db = db.get('users');
var ban_db = db.get('bans');

function isTokenBan(jti) {
    return new Promise(function (resolve, reject){
        if(jti === undefined || jti === null) {
            resolve(false);
            return
        }
        ban_db.findOne({'id': jti}).then(ban => {
            if(ban) {
                resolve(true);
            } else {
                resolve(false);
            }
        }).catch(err => {
            logger.error('Failed to check bans');
            reject('Failed to check bans');
        });
    });

}

router.get('/swift/:owner/:project/:caller', function(req, res){
    logger.debug('check authorization', req.params.owner, req.params.project, req.params.caller);
    let caller = decodeURIComponent(req.params.caller);
    isTokenBan(req.query.jti).then(isBan => {
        if (isBan) {
            res.status(403).send('not authorized');
            return;             
        }
            
        if(CONFIG.herodote.admin) {
            let admins = CONFIG.herodote.admin.split(',');
            if(admins.indexOf(caller) >= 0) {
                logger.debug('admin request, authorize');
                res.send({'msg': 'ok'})
                res.end();
                return;
            }
        }
        let projectName = req.params.project.replace(req.params.owner+'_', '').replace('_segments', '');
        return projects_db.findOne({owner: req.params.owner, name: projectName})
    }).then(p => {
        if(! p) {
            res.status(404).send('project not found');
            return;
        }
        let found = false;
        if (caller == p.owner) {
            res.send({'msg': 'ok'});
            res.end();
            return;
        }
        if (! p.acls) {
            res.status(403).send('not authorized');
            return;           
        }
        // Check caller id is authorized
        for(let i=0;i<p.acls.length;i++) {
            let acl = p.acls[i];
            if (caller == acl.name) {
                found = true;
                break
            }
        }
        if (!found){
            res.status(403).send('not authorized');
            return;
        }
        res.send({'msg': 'ok'})
    }).catch(err => {
        res.status(403).send('not authorized');
    })

})

router.get('/oidc/login', function(req, res) {
    oidcauth.auth().then(redirectUrl => {
        res.redirect(redirectUrl);  
    })
})

router.get('/aai/callback', function(req, res) {
    oidcauth.callback(req).then(user => {
        // TODO get a unique uidnumber
        let project = CONFIG.openstack.keystone.os_user_project;
        user = {
            'uid': user.sub,
            'mail': user.email,
            'uidNumber': 1000,
            'gidNumber': parseInt(CONFIG.oidc.ldap_group_gid),
            'external': true
        };
        keystone.bind(user.sub, null, null, null, true).then(resp => {
            //let ksToken = resp.ksToken;
            let ksToken = "";
            let ksUserId = resp.ksUserId;
            user.ksUserId = ksUserId;
            user.ksProjectName = project;
            try {
                ksToken = jwt.sign(
                { user: user, isLogged: true },
                CONFIG.secrets.jwt,
                {expiresIn: "2 days"}
            );
            } catch(err) {
                logger.error('Error' + err)
            }
            authStat.inc({'type': 'external'});
            ldap.addOIDC(user).then(u => {
                user.uidNumber = u.uidNumber
                users_db.update(
                    {'uid': user.uid},
                    {'$set': {
                        mail: user.mail,
                        uidNumber: user.uidNumber,
                        gidNumber: user.gidNumber,
                        external: user.external
                        },
                    },
                    {upsert: true}
                ).then( updateRes => {
                    res.redirect(CONFIG.herodote.public_href + '/ui/?oidcToken=' + ksToken);
                })
            }).catch(err => {
                logger.error('failed to add to ldap', user);
                res.redirect(CONFIG.herodote.public_href + '/ui');
            });
        });
    }).catch(err => {
        console.log('aai auth error', err.response.data);
        res.status(500).send(err.message).end();
    })
})

router.get('/autobind', function(req, res) {
    if(! req.locals.logInfo.is_logged) {
        res.status(401).send('Not authorized');
        return;
    }
    res.send({isLogged: true, user: req.locals.logInfo.session_user})
})


router.post('/', function(req, res, next) {
  logger.debug('auth request', req.body.login);
  let login = req.body.login;
  let project = CONFIG.openstack.keystone.os_user_project;
  let domain = CONFIG.openstack.keystone.os_user_domain;

  if (process.env.FAKE_AUTH === "1") {
      logger.warn('using FAKE auth');
      authStat.inc({'type': 'fake'});
      fakeauth.auth(login, null).then(user => {
        keystone.bind(login, null, null, null, true).then(resp => {
            //let ksToken = resp.ksToken;
            let ksToken = "";
            let ksUserId = resp.ksUserId;
            user.ksUserId = ksUserId;
            user.ksProjectName = project;
            let userToken = null
            try {
              userToken = jwt.sign(
                { user: user, isLogged: true },
                CONFIG.secrets.jwt,
                {expiresIn: "2 days"}
            );
            } catch(err) {
              logger.error('Error' + err)
            }
            res.send({'user': user, 'token': userToken, 'keystoneToken': ksToken});
            res.end()
        })
      })
      return
  }

  let password = req.body.password;

  if (req.body.project) {
      project = req.body.project;
  }
  if (req.body.domain) {
    domain = req.body.domain;
  }
  ldap.auth(login, password).then(user => {
    logger.info("Auth user", user);
    let force_bind = false;
    if(user.external) {
        force_bind = true;
    }
    keystone.bind(login, password, project, domain, force_bind).then( resp => {
        let ksToken = resp.ksToken;
        if (user.external) {ksToken = ""};
        let ksUserId = resp.ksUserId;
        user.ksUserId = ksUserId;
        user.ksProjectName = project;
        let userToken = null
        try {
          userToken = jwt.sign(
            { user: user, isLogged: true },
            CONFIG.secrets.jwt,
            {expiresIn: "2 days"}
        );
        } catch(err) {
          logger.error('Error' + err)
        }
        authStat.inc({'type': 'internal'});
        res.send({'user': user, 'token': userToken, 'keystoneToken': ksToken});
        res.end()
    })

  })

});

module.exports = router;
