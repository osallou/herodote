var CONFIG = require('config');
var Promise = require('promise');
const axios = require('axios')
var winston = require('winston');
const logger = winston.loggers.get('herodote');

var monk = require('monk');
var db = monk(CONFIG.mongo.host + ':' + parseInt(CONFIG.mongo.port) + '/' + CONFIG.mongo.db);
var jobs_db = db.get('jobs');
var users_db = db.get('users');

/*
config:

herodote:
  ...
  godocker:
    url: "https://godocker.genouest.org"
    run_as: 'bioinfo'
    admin_uid: 'XXX'
    admin_apikey: 'XXX'

*/

jobTemplate = function(job) {
    return {
        id: null,
        requirements: {
            cpu: job.hook.cpu,
            ram: job.hook.mem,
            executor: job.hook.executor,
            gpus: 0,
        },
        meta: {
            tags: ['herodote', job.hook.name],
            name: job.id,
            description: 'herodote job for file ' + job.filePath
        },
        command: {
            cmd: job.hook.script,
            interactive: false
        },
        user: {
            id: job.user,
            project: 'default'
        },
        container: {
            image: "debian",
            volumes: [],
            ports: []
        }
    }
}

/* get token */
function getToken() {
    return new Promise(function(resolve, reject){
        let adminUser = CONFIG.herodote.godocker.admin_uid;
        let adminApiKey = CONFIG.herodote.godocker.admin_apikey;
        let auth = {
            user: adminUser,
            apikey: adminApiKey
        }
        let god_url = CONFIG.herodote.godocker.url + '/api/1.0/authenticate';
        axios.post(god_url, auth, {headers: {
            'Content-Type': 'application/json',
        }}).then(res => {
            token = res.data['token']
            resolve(token);
        }).catch(err => {
            console.log("failed to authenticate in godocker")
            resolve("");
        })

    })
}

module.exports = {
    run: (job) => {
        return new Promise(function(resolve, reject){
            users_db.findOne({uid: job.user}).then(u => {
              let tmpl = jobTemplate(job);
              if(job.externalUser) {
                if(u && u.uidNumber && u.gidNumber) {
                  tmpl.user.uid = u.uidNumber;
                  tmpl.user.gid = u.gidNumber;
                }
                else {
                    tmpl.user.id = CONFIG.herodote.godocker.run_as;
                }
              }

              let project = "default";
              let image = "debian";
              let volumes = [];
              let loaded_volumes = [];
              for(let i=0;i<job.hook.extra.length;i++){
                  let extra = job.hook.extra[i];
                  if(extra.startsWith('project=')){
                      project = extra.replace('project=', '');
                  } else if(extra.startsWith('image=')) {
                      image = extra.replace('image=', '');
                  } else if(extra.startsWith('volumes=')) {
                      let tmpvol = extra.replace('volumes=', '').split(',')
                      for(let v=0;v<tmpvol.length;v++) {
                          let volume = tmpvol[v];
                          volumes.push({'acl': 'ro', 'name': volume})
                          loaded_volumes.push(volume)
                      }
                  }
              }

              let extra_volumes = CONFIG.herodote.godocker.extra_volumes
              let extras = extra_volumes.split(',')
              for(let v=0;v<extras.length;v++){
                  if(loaded_volumes.indexOf(extras[v]) < 0) {
                      volumes.push({name: extras[v], acl: "ro"})
                  }
              }

              tmpl.user.project = project;
              tmpl.container.image = image;
              tmpl.container.volumes = volumes;

              getToken().then(token => {
                let god_url = CONFIG.herodote.godocker.url + '/api/1.0/task';
                axios.post(god_url, tmpl, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'bearer ' + token
                    }
                }).then(godres => {
                    jobs_db.update({id: job.id},{'$set': {'runId': godres.data['id']}}).then(j => {
                        resolve(true);
                    }).catch(err => {
                        console.log('failed to update job', job)
                        resolve(true);
                    })
                }).catch(err => {
                    console.log('failed to send job', err.message)
                    resolve(true);
                });
              });
            });
        });
    }
}
