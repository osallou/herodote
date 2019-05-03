var CONFIG = require('config');
var ldap = require('ldapjs');
var Promise = require('promise');
var crypto = require('crypto');
var winston = require('winston');
var fs = require('fs');
const logger = winston.loggers.get('herodote');
var redis = require('redis');

var monk = require('monk');
var db = monk(CONFIG.mongo.host + ':' + parseInt(CONFIG.mongo.port) + '/' + CONFIG.mongo.db);
var users_db = db.get('users');

var options = {
    url: CONFIG.ldap.uri, // string
    //version: 3, // integer, default is 3,
    starttls: (CONFIG.ldap.tls === true || CONFIG.ldap.tls === "true"), // boolean, default is false
    connecttimeout: -1, // seconds, default is -1 (infinite timeout), connect timeout
    //timeout: 5000, // milliseconds, default is 5000 (infinite timeout is unsupported), operation timeout
    //reconnect: true, // boolean, default is true,
    //backoffmax: 32 // seconds, default is 32, reconnect timeout
};

let redis_cfg = {host: CONFIG.redis.host, port: (parseInt(CONFIG.redis.port) || 6379)}
logger.info("Using Redis", redis_cfg)
redis_client = redis.createClient(redis_cfg)


function getUniqueId() {
    return new Promise(function (resolve, reject){
        redis_client.incr('herodote:ldap:id', function (err, res) {
            resolve(parseInt(res) + parseInt(CONFIG.oidc.ldap_uid_start));
          })
    });

}

addLdapIfNotExists = (client, user) => {
    return new Promise(function (resolve, reject){
        users_db.findOne({'uid': user.uid}).then(u => {
            if(!u) {
                getUniqueId().then(uid => {
                    user.uidNumber = uid
                    addUser(client, user).then(r => {
                        resolve(user);
                    }).catch(err => {
                        reject(err);
                    })
                })
            } else {
                resolve(user);
            }
        }).catch(err => {
            logger.error('failed to search user', user);
            reject('failed to search user');
        })
    });
};

addUser = (client, user) => {
    return new Promise(function (resolve, reject){
        let entry = {
            cn: user.mail,
            sn: user.uid,
            mail: user.mail,
            uidNumber: user.uidNumber,
            gidNumber: user.gidNumber,
            homeDirectory: CONFIG.oidc.ldap_base_home + '/' + user.uid.split('@')[0],
            userPassword: crypto.randomBytes(20).toString('hex'),
            loginShell: '/bin/bash',
            objectclass: ['posixAccount', 'top', 'inetOrgPerson']
          };
          client.add('uid=' + user.uid + ',' + CONFIG.oidc.ldap_search_base + ',' + CONFIG.ldap.dn, entry, function(err) {
            if(err) {
                logger.error(err);
                reject('failed to add user');
                return;
            }
            try {
                fs.mkdirSync(entry.homeDirectory, {recursive: true});
                fs.chownSync(entry.homeDirectory, user.uidNumber, user.gidNumber);
            }
            catch(err) {
                logger.error('Failed to create user home directory')
            }
            resolve(user);
          });
    });
};

authUser = (client, login, password) => {
    return new Promise(function (resolve, reject){
        let user = null;
        let opts = {
            filter: '(uid=' + login + ')',
            scope: 'sub',
            attributes: ['dn', 'mail', 'uid', 'uidNumber', 'gidNumber']
          };
  
          client.search('ou=people,' + CONFIG.ldap.dn, opts, function(err, res) {
              if(err) {
                  logger.error('Could not find ' + login);
                  resolve(null);
              }
              let foundMatch = false;
              res.on('searchEntry', function(entry) {
                  let user_dn = entry.object['dn'];
                  foundMatch = true;
                  client.bind(user_dn, password, function(err) {
                      if(err) {
                          resolve(null)
                      } else {
                          user = {
                              'uid': entry.object.uid,
                              'mail': entry.object.mail,
                              'uidNumber': parseInt(entry.object.uidNumber),
                              'gidNumber': parseInt(entry.object.gidNumber),
                              'external': false
                          };
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
                          ).then( res => {
                            resolve(user);
                          })
                          
                      }
                  });
              });
              res.on('searchReference', function(referral) {
              });
              res.on('error', function(err) {
                  logger.error('error ' + err.message);
                  resolve(null);
              });
              res.on('end', function(result) {
                  if(! foundMatch){
                      logger.debug('no user found');
                      resolve(null);
                  }
              });
          });
  
        
    });
};

module.exports = {
    auth: (login, password) => {
        return new Promise(function (resolve, reject){
            let client = ldap.createClient(options);
            if (CONFIG.ldap.admin_user) {
                client.bind(CONFIG.ldap.admin_user, CONFIG.ldap.admin_password, function(err) {
                    if (err) {
                        logger.error("Failed to bind to LDAP");
                        resolve(null);
                        return;
                    }
                    authUser(client, login, password).then(user => {
                        resolve(user);
                        return;
                    })
                });
            } else {
                authUser(client, login, password).then(user => {
                    resolve(user);
                    return;
                })
            }
        }); 
    },
    addOIDC: (user) => {
        return new Promise(function (resolve, reject){
            let client = ldap.createClient(options);
            client.bind(CONFIG.ldap.admin_user, CONFIG.ldap.admin_password, function(err) {
                if (err) {
                    logger.error("Failed to bind to LDAP");
                    reject("Failed to bind to LDAP");
                    return;
                }
                addLdapIfNotExists(client, user).then(resUser => {
                        resolve(resUser);
                        return;
                }).catch(err => {
                    reject(err);
                })
            });
        });
    }

}