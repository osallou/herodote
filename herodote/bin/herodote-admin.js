#!/usr/bin/env node

const program = require('commander')

var CONFIG = require('config')
var monk = require('monk')
var db = monk(CONFIG.mongo.host + ':' + parseInt(CONFIG.mongo.port) + '/' + CONFIG.mongo.db);
var users_db = db.get('users');
var projects_db = db.get('projects');

var keystone = require('../lib/keystone');
var swift = require('../lib/swift');
var bytes = require('bytes');

if (!console.table){
    require('console.table')
}
  

var winston = require('winston')
const myconsole = new (winston.transports.Console)({
  timestamp: true,
  level: 'info'
})
winston.loggers.add('herodote', {
  transports: [myconsole]
})

const logger = winston.loggers.get('herodote')

program
  .command('projects') // sub-command name
  .description('List projects') // command description
  .option('-u, --user [value]', 'projects of user', null)
  .action(function (args) {
    let filter = {};
    if(args.user) { filter['owner'] = args.user }
    projects_db.find(filter).then(projects => {
        displayRes = []
        for(let i=0;i<projects.length;i++){
          let res = projects[i]
          displayRes.push({'name': res.name, 'owner': res.owner});
        }
        console.table(displayRes);
        process.exit(0);
      })      
  })

  program
  .command('project') // sub-command name
  .description('show project') // command description
  .arguments('<owner>')
  .arguments('<name>')
  .action(function (owner, name) {
    let filter = {'name': name, 'owner': owner};
    projects_db.findOne(filter).then(project => {
        if (!project) {
            console.log('project not found');
            process.exit(1);
        }
        displayRes = {
            name: project.name,
            owner: project.owner,
            hooks: project.hooks.length,
            acls: project.acls.length,
            project: project.ksProject
        }
        let bucket = project.owner + '_' + project.name;
        let hooks = [];
        for(let i=0;i<project.hooks.length;i++) {
            let hook = project.hooks[i];
            hooks.push({'name': hook.name, 'regexp': hook.regexp, 'executor': hook.executor})
        }
        let acls = [];
        for(let i=0;i<project.acls.length;i++) {
            let acl = project.acls[i];
            acls.push({'name': acl.name, 'ro': acls.ro})
        }
        keystone.bind(null, null, null, null, true).then(token => {
            swift.meta(displayRes.project, bucket, token.ksToken).then(meta => {
                displayRes['last-modified'] = meta.bucket['last-modified'];
                displayRes['x-container-object-count'] = meta.bucket['x-container-object-count'];
                displayRes['x-container-bytes-used'] = meta.bucket['x-container-bytes-used'];
                console.table(displayRes);
                console.log('Hooks');
                console.table(hooks);
                console.log('ACLs');
                console.table(acls);
                process.exit(0);
            }).catch(err => {
                console.table(displayRes);
                console.log('Hooks');
                console.table(hooks);
                console.log('ACLs');
                console.table(acls);
                process.exit(0);
            })
        }).catch(err => {
            console.table(displayRes);
            process.exit(0);           
        })

      })      
})

program
  .command('users') // sub-command name
  .description('List users') // command description
  .action(function (args) {
    users_db.find({}).then(users => {
      displayRes = []
      for(let i=0;i<users.length;i++){
        let res = users[i]
        displayRes.push({'uid': res.uid, 'email': res.email});
      }
      console.table(displayRes);
      process.exit(0);
    })
})

program
  .command('get-token') // sub-command name
  .description('get an admin token for project') // command description
  .arguments('<owner>')
  .arguments('<name>')
  .action(function (owner, name) {
    let filter = {'name': name, 'owner': owner};
    projects_db.findOne(filter).then(project => {
        if (!project) {
            console.log('project not found');
            process.exit(1);
        }
        try {
            let bucket = owner + '_' + name;
            let ksToken = jwt.sign(
                {
                    owner: owner,
                    container: bucket,
                    user: CONFIG.openstack.keystone['os_user_id'],
                    account: "AUTH_" + project.ksProject,
                    ro: false,
                    admin: true
                },
                CONFIG.secrets.swift
            );
            console.table({'token': kstoken});
            } catch(err) {
                logger.error('Error' + err);
            }
            process.exit(0);
        });
        
})

program
  .command('get-quota') // sub-command name
  .description('get project quotas') // command description
  .arguments('<owner>')
  .arguments('<name>')
  .action(function (owner, name) {
    let filter = {'name': name, 'owner': owner};
    projects_db.findOne(filter).then(project => {
        if (!project) {
            console.log('project not found');
            process.exit(1);
        }
        displayRes = {
            name: project.name,
            owner: project.owner,
            project: project.ksProject
        }
        let bucket = project.owner + '_' + project.name;
        keystone.bind(null, null, null, null, true).then(token => {
            swift.meta(displayRes.project, bucket, token.ksToken).then(meta => {
                if(meta.bucket['x-container-meta-quota-bytes']) {
                    displayRes['quota'] = bytes(parseInt(meta.bucket['x-container-meta-quota-bytes']))
                } else {
                    displayRes['quota'] = 0
                }
                console.table(displayRes);
                process.exit(0);
            }).catch(err => {
                console.log("Cannot get metadata information");
                console.table(displayRes);
                process.exit(0);
            })
        }).catch(err => {
            console.log("Cannot get metadata information");
            console.table(displayRes);
            process.exit(0);           
        })

      })      
})

program
  .command('set-quota') // sub-command name
  .description('set project quotas, example: 3MB, 1GB, 1TB') // command description
  .arguments('<owner>')
  .arguments('<name>')
  .arguments('<quota>')
  .action(function (owner, name, quota) {
    let filter = {'name': name, 'owner': owner};
    projects_db.findOne(filter).then(project => {
        if (!project) {
            console.log('project not found');
            process.exit(1);
        }
        displayRes = {
            name: project.name,
            owner: project.owner,
            project: project.ksProject
        }
        let bucket = project.owner + '_' + project.name;

        keystone.bind(null, null, null, null, true).then(token => {
            let meta = {
                "X-Container-Meta-Quota-Bytes": bytes(quota)
            }
            swift.setMeta(meta, displayRes.project, bucket, token.ksToken).then(res => {
                displayRes['quota'] = quota
                console.table(displayRes);
                process.exit(0);
            }).catch(err => {
                console.log("Cannot set metadata information", err);
                console.table(displayRes);
                process.exit(0);
            })
        }).catch(err => {
            console.log("Cannot set metadata information", err);
            console.table(displayRes);
            process.exit(0);           
        })

      })      
})


program.parse(process.argv);

var NO_COMMAND_SPECIFIED = program.args.length === 0;

if (NO_COMMAND_SPECIFIED) {
      program.help();
}