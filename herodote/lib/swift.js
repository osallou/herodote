var CONFIG = require('config');
var ldap = require('ldapjs');
var Promise = require('promise');

var winston = require('winston');
const axios = require('axios')
var CONFIG = require('config');

const logger = winston.loggers.get('herodote');

var rabbit = require('../lib/rabbit');

module.exports = {

    meta: (project, bucket, ksToken) => {
        return new Promise(function (resolve, reject){
            let swift_url = CONFIG.openstack.swift.url + "/v1/AUTH_" + project + "/" + bucket;
            axios.head(swift_url, {
                headers: {"X-Auth-Token": ksToken}
            }).then(
                resp => {
                    resolve({bucket: resp.headers})
                }
            ).catch(err => {
                logger.error('swift meta failure:' + err)
                reject('failed to get bucket meta');
            })
        }); 
    },

    setMeta: (meta, project, bucket, ksToken) => {
        return new Promise(function (resolve, reject){
            let swift_url = CONFIG.openstack.swift.url + "/v1/AUTH_" + project + "/" + bucket;
            let headers = meta;
            headers["X-Auth-Token"] = ksToken;
            axios.post(swift_url, {}, {
                headers: headers
            }).then(
                resp => {
                    let segments_url = CONFIG.openstack.swift.url + "/v1/AUTH_" + project + "/" + bucket + "_segments";
                    axios.post(segments_url, {}, {
                        headers: headers
                    }).then(
                        segRes => resolve({bucket: resp.headers})
                    ).catch(err => {
                        logger.error('swift meta failure for ' + bucket + '_segments:' + err)
                        reject('failed to set bucket meta ' + bucket + '_segments');
                    })
                }
            ).catch(err => {
                logger.error('swift meta failure for ' + bucket + ':' + err)
                reject('failed to set bucket meta ' + bucket);
            })
        }); 
    },

    setMetaPrimary: (meta, project, bucket, ksToken) => {
        console.log('????')
        return new Promise(function (resolve, reject){
            console.log('set meta primary', meta)
            let swift_url = CONFIG.openstack.swift.url + "/v1/AUTH_" + project + "/" + bucket;
            let headers = meta;
            headers["X-Auth-Token"] = ksToken;
            axios.post(swift_url, {}, {
                headers: headers
            }).then(
                resp => {
                    resolve({bucket: resp.headers})
                }
            ).catch(err => {
                logger.error('swift primary meta failure for ' + bucket + ':' + err)
                reject('failed to set bucket primary meta ' + bucket);
            })
        }); 
    },

    create: (project, bucket, ksToken) => {
        return new Promise(function (resolve, reject){
            let swift_url = CONFIG.openstack.swift.url + "/v1/AUTH_" + project + "/" + bucket;
            axios.put(swift_url, {}, {
                headers: {"X-Auth-Token": ksToken}
            }).then(
                resp => {
                    let segments_url = CONFIG.openstack.swift.url + "/v1/AUTH_" + project + "/" + bucket + '_segments';
                    axios.put(segments_url, {}, {
                        headers: {"X-Auth-Token": ksToken}
                    }).then(                   
                        segresp => resolve({bucket: resp.data})
                    ).catch(err => {
                        logger.error('failed to created segments bucket ' + bucket);
                        resolve({bucket: resp.data});
                    })
                }
            ).catch(err => {
                logger.error('Keystone auth failure:' + err)
                reject('failed to create bucket');
            })
        }); 
    },
    delete: (project, bucket, ksToken) => {
        return new Promise(function (resolve, reject){
            let swift_url = CONFIG.openstack.swift.url + "/v1/AUTH_" + project + "/" + bucket;
            axios.delete(swift_url, {
                headers: {'X-Auth-token': ksToken}
            }).then(
                resp => {
                    let segments_url = CONFIG.openstack.swift.url + "/v1/AUTH_" + project + "/" + bucket + "_segments";
                    axios.delete(segments_url, {
                        headers: {'X-Auth-token': ksToken}
                    }).then(
                        segRes => resolve({bucket: resp.data})
                    ).catch(err => {
                        if(err.response && err.response.status == 404){
                            resolve({bucket: resp.data})
                            return
                        }
                        logger.error('failed to delete ' + bucket + "_segments");
                        resolve({bucket: resp.data});
                    })
                }
            ).catch(err => {
                if(err.response && err.response.status == 404){
                    resolve({bucket: bucket})
                    return;
                }
                logger.error('Deletion failure:' + err);
                resolve({bucket: null, 'msg': err});
            })
        });
    }
}