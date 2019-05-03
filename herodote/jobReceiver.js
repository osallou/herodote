var CONFIG = require('config');
var monk = require('monk');
var db = monk(CONFIG.mongo.host + ':' + parseInt(CONFIG.mongo.port) + '/' + CONFIG.mongo.db);
var jobs_db = db.get('jobs');
var projects_db = db.get('projects');
var users_db = db.get('users');
var Promise = require('promise');
var amqp = require('amqplib/callback_api');

var godexec = require('./lib/executor/godocker');
var webhook = require('./lib/executor/webhook');

/*
let job = {
            id: bucket+'.'+ts,
            hook: hook,
            projectId: project._id,
            file: filePath,
            start: ts,
            end: 0,
            status: CREATED,
            code: -1
        }
{'job': job, 'action': 'createJob'}

*/

/* script vars to replace
$SENDHERODOTEPROGRESS 1
WORKDIR = $PWD
cd WORKDIR
mkdir -p $JOBNAME/data $JOBNAME/result $JOBNAME/script
cd $JOBNAME/data
$SWIFTDOWNLOAD $FILE
# Uncompress if needed
#tar xvfz $FILE
# do some job
# mv results to ../result
cd ../result
tar cfvz $JOBNAME.tar.gz *
$SWIFTUPLOAD $JOBNAME.tar.gz
$SENDHERODOTEPROGRESS 2

*/

function bail(err) {
    console.error(err);
    process.exit(1);
}


function submitJob(job) {
    return new Promise(function(resolve, reject){
        // console.log('should execute', JSON.stringify(job));
        let executor = CONFIG.herodote[job.hook.executor].executor;
        if(executor == "godocker") {
            godexec.run(job).then(
                resp => {
                    resolve(true);
                }
            ).catch(err => {
                console.log('executor failed for job', job);
                resolve(false);
            })
        } else if (executor == "webhooks"){
            webhook.run(job).then(
                resp => {
                    resolve(true);
                }
            ).catch(err => {
                console.log('executor failed for job', job);
                resolve(false);
            })
        } else {
            console.log("no executor found for job", job);
            resolve(false);
        }
    });
}


function createJob(content) {
    return new Promise(function(resolve, reject){
        let job = content.job;
        projects_db.findOne({'_id': job.projectId}).then(project => {
            let ksToken = project.ksToken;
            let jobName = job.id;
            let swiftDownload = "swift --os-auth-token \"$HERODOTETOKEN\" --os-storage-url " + CONFIG.openstack.swift.url + "/v1/AUTH_" + project.ksProject + " download " + project.owner + "_" + project.name;
            let swiftUpload = "swift --os-auth-token \"$HERODOTETOKEN\" --os-storage-url " + CONFIG.openstack.swift.url + "/v1/AUTH_" + project.ksProject + " upload " + project.owner + "_" + project.name + " --segment-size 1073741824 ";
            let swiftNotify = "curl -X PUT " + CONFIG.herodote.public_href + '/jobs/' + job.id + '/';
            let heroDownload = "hero-file --os-auth-token \"$HERODOTETOKEN\" --os-storage-url " + CONFIG.openstack.swift.url + "/v1/AUTH_" + project.ksProject + " download " + project.owner + "_" + project.name;
            let heroUpload = "hero-file --os-auth-token \"$HERODOTETOKEN\" --os-storage-url " + CONFIG.openstack.swift.url + "/v1/AUTH_" + project.ksProject + " --segment-size 1073741824 " + " upload " + project.owner + "_" + project.name;
            let heroNotify = "hero-notify --server " + CONFIG.herodote.public_href + " --job " + job.id + " --status ";

            let hookExecutor = job.hook.executor;
            let loadSwiftClient = '';
            if(CONFIG.herodote[hookExecutor]) {
                let executor = CONFIG.herodote[hookExecutor].executor;
                let executorCfg = CONFIG.herodote[executor];
                if(executorCfg !== undefined && executorCfg.load_module) {
                    loadSwiftClient = executorCfg.load_module;
                }
            }
            if (loadSwiftClient != ''){
                loadSwiftClient = loadSwiftClient + ' || echo "cannot load swift client, trying anyway"';
            }

            let script = job.hook.script;
            let client = 'swift'
            if(CONFIG.herodote[hookExecutor]) {
                let executor = CONFIG.herodote[hookExecutor].executor;
                let executorCfg = CONFIG.herodote[executor];
                if(executorCfg !== undefined && executorCfg.client) {
                    client = executorCfg.client;
                }
                if(client == 'swift') {
                    script = script.replace(/\$JOBNAME/g, jobName)
                    .replace(/\$HERODOTETOKEN/g, ksToken)
                    .replace(/\$FILE/g, job.file)
                    .replace(/\$SWIFTUPLOAD/g, swiftUpload)
                    .replace(/\$SWIFTDOWNLOAD/g, swiftDownload)
                    .replace(/\$SENDHERODOTEPROGRESS /g, swiftNotify)
                }
                else if(client == 'hero') {
                    script = script.replace(/\$JOBNAME/g, jobName)
                    .replace(/\$HERODOTETOKEN/g, ksToken)
                    .replace(/\$FILE/g, job.file)
                    .replace(/\$SWIFTUPLOAD/g, heroUpload)
                    .replace(/\$SWIFTDOWNLOAD/g, heroDownload)
                    .replace(/\$SENDHERODOTEPROGRESS /g, heroNotify)
                }
            } else {
                script = script.replace(/\$JOBNAME/g, jobName)
                .replace(/\$HERODOTETOKEN/g, ksToken)
                .replace(/\$FILE/g, job.file)
                .replace(/\$SWIFTUPLOAD/g, swiftUpload)
                .replace(/\$SWIFTDOWNLOAD/g, swiftDownload)
                .replace(/\$SENDHERODOTEPROGRESS /g, swiftNotify)
            }

            script = script.replace(/\$LOADSWIFTCLIENT/g, loadSwiftClient)
            job.hook.script = script;
            users_db.findOne({'uid': project.owner}).then( u => {
                if(!u) {
                    console.log('user not found, skipping job', job);
                    resolve(true);
                    return
                }
                if(u.external) {
                    job['externalUser'] = true
                } else {
                    job['externalUser'] = false
                }
                submitJob(job).then(jobres => {
                    resolve(true);
                })
            }
            ).catch(err => {
                console.log('user not found, skipping job', job);
                resolve(true);
            })
            
        }).catch(err => {
            console.log('failed to find project', job);
            resolve(true);
        })
    })
}



function consumer(conn) {
    var ok = conn.createChannel(on_open);
    function on_open(err, ch) {
      if (err != null) bail(err);
      console.log('connected to queue ' + CONFIG.rabbitmq.queue);
      ch.assertQueue(CONFIG.rabbitmq.queue);
      ch.consume(CONFIG.rabbitmq.queue, function(msg) {
        if (msg !== null) {
            let content = JSON.parse(msg.content.toString());
            if(content.action == 'createJob') {
                createJob(content).then(resp => {
                    ch.ack(msg);
                })
            } else {
                ch.ack(msg);
            }
        } else {
            ch.ack(msg);
        }
      });
    }
  }
  
amqp.connect(CONFIG.rabbitmq.url, function(err, conn) {
      if (err != null) bail(err);
      consumer(conn);
});


