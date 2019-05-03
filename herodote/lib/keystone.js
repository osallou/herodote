var CONFIG = require('config');
var Promise = require('promise');
const axios = require('axios')
var winston = require('winston');
const logger = winston.loggers.get('herodote');

require('axios-debug-log');

_authData = (login, password, project, domain) => {
    return {
        'auth': {
            'scope':
                {'project': {
                    'name': project,
                    'domain':
                        {
                          'name': domain
                        }
                    }
                 },
            'identity': {
                    'password': {
                        'user': {
                            'domain': {
                                'name': domain
                            },
                            'password': password,
                            'name': login
                        }
                    },
                    'methods': ['password']
                }
        }
    }
}

module.exports = {

    isToken: (req) => {
        return new Promise(function(resolve, reject){
            let requestToken = req.locals.logInfo.ksToken;
            if(requestToken !== null && requestToken != "" ) {
                resolve(requestToken);
            } else {
                module.exports.bind(null, null, null, null, true).then(result => {
                    resolve(result.ksToken);
                })
            }
            
        })
    },
    bind: (login, password, project, domain, force_bind_to) => {
        return new Promise(function (resolve, reject) {
            let _auth = null
            if (force_bind_to) {
                _auth = _authData(
                    CONFIG.openstack.keystone.os_user_id,
                    CONFIG.openstack.keystone.os_user_password,
                    CONFIG.openstack.keystone.os_user_project,
                    CONFIG.openstack.keystone.os_user_domain
                );
            } else {
                _auth = _authData(login, password, project, domain);
            }
            let ks_url = CONFIG.openstack.keystone.url + '/auth/tokens';
            axios.post(ks_url, _auth).then(
                resp => {
                    let token = null;
                    if(! resp.headers['x-subject-token']) {
                        logger.warn('failed to get keystone token:' +  resp.status + ', ' + resp.statusText);
                        resolve({ksToken: null, ksUserId: null});
                        return;                       
                    }
                    token = resp.headers['x-subject-token'];
                    let ksUserId = resp.data.token.user.id;
                    resolve({ksToken: token, ksUserId: ksUserId})
                }
            ).catch(err => {
                logger.error('Keystone auth failure:' + err)
                resolve({ksToken: null, ksUserId: null});
            })
        });

    },
    listProjects: (token, ksUserId) => {
        return new Promise(function (resolve, reject) {
            let ks_url = CONFIG.openstack.keystone.url + '/users/' + ksUserId + '/projects';
            axios.get(ks_url, {
                headers: {
                    "X-Auth-Token": token
                }
            }).then(
                resp => {
                    let projects = [];
                    for(let i=0;i<resp.data['projects'].length;i++){
                        let project = resp.data['projects'][i];
                        if(! project.is_domain) {
                            projects.push(project);
                        }
                    }
                    resolve(projects)
                },
                err => {
                    logger.error('Failed to fetch keystone projects')
                    reject('failed to fetch projects')
                }
            ).catch(err => {
                logger.error('Failed to fetch keystone projects', err)
                resolve([])               
            })
        });
    }
}