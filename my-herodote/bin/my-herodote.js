#!/usr/bin/env node

const program = require('commander');
const homedir = require('os').homedir();
var Promise = require('promise');
const axios = require('axios');
const readline = require('readline');
const fs = require('fs');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });


function getToken() {
    return new Promise(function(resolve, reject) {
        if(process.env.HERO_TOKEN !== undefined && process.env.HERO_TOKEN !== "") {
            resolve(process.env.HERO_TOKEN)
            return
        }
        fs.readFile(homedir + '/.herodote', (err, token) => {  
            if (err) { reject(err); return;}
            resolve(token);
        });
    });
}

function dateConvert(tsp){
    if(tsp == 0) { return "-"};
    var a = new Date(tsp);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var year = a.getFullYear();
    var month = months[a.getMonth()];
    var date = a.getDate();
    var hour = a.getHours();
    var min = a.getMinutes();
    var sec = a.getSeconds();
    var time = date + ',' + month + ' ' + year + ' ' + hour + ':' + min + ':' + sec ;
    return time;
  }

function getStatus(s) {
    if(s == 0) {
      return "pending"
    } else if (s == 1) {
      return "running"      
    } else if (s == 2) {
      return "done"      
    } else if (s == 3) {
      return "error"      
    } else if (s == 4) {
        return "killed"
    }
  }

program
  .command('login') // sub-command name
  .description('login with herodote') // command description
  .arguments('<login>')
  .arguments('<project>')
  .option('--host [value]', 'Herodote server address https://xxx', 'https://herodote.genouest.org')
  .action(function (login, project, args) {
    rl.question('Enter your password? ', (answer) => {
        rl.close();
        // TODO do login and write token in ~/.herodote in 0600
        axios.post(args.host + '/auth', {
            login: login,
            password: answer,
            project: project
        }).then(res => {
            fs.writeFile(homedir + '/.herodote', res.data.token, {mode: 0o600}, (err) => {  
                if (err) {
                    console.error(err);
                } else {
                    console.log('logged in, ~/.herodote up to date...');
                }
                process.exit(0);
            });
        }).catch(err => {
            console.log('error', err);
            process.exit(1);
        })
      });         
})

program
  .command('projects')
  .option('--as [value]', 'Run request as [user], admin only', null)
  .option('--host [value]', 'Herodote server address https://xxx', 'https://herodote.genouest.org')
  .action(function (args) {
    getToken().then((token) => {
        let headers = {'Authorization': 'bearer ' + token};
        if(args.as) {
            headers['x-herodote-bind'] = args.as;
        }
        axios.get(args.host + '/projects', {headers: headers}).then(res => {
            let projects = [];
            for(let i=0;i<res.data.projects.length;i++){
                let project = res.data.projects[i];
                projects.push({'id': project._id, 'name': project.name, 'description': project.description, 'hooks': project.hooks.length, 'acls': project.acls.length})
            }
            console.table(projects);
            process.exit(0);
        }).catch(err => {console.error('Error:', err.message); process.exit(1)})
    }).catch(err => {
        console.error(err);
        process.exit(1);
    }) 
  });


  program
  .command('project')
  .arguments('<name>')
  .option('--as [value]', 'Run request as [user], admin only', null)
  .option('--host [value]', 'Herodote server address https://xxx', 'https://herodote.genouest.org')
  .action(function (name, args) {
    getToken().then((token) => {
        let headers = {'Authorization': 'bearer ' + token};
        if(args.as) {
            headers['x-herodote-bind'] = args.as;
        }
        axios.get(args.host + '/projects/' + name, {headers: headers}).then(res => {
            let project = res.data.project;
            if (project == null) {
                console.log('project not found');
                process.exit(0);
            }
            console.table({'id': project._id, 'name': project.name, 'description': project.description, 'hooks': project.hooks.length, 'acls': project.acls.length});
            console.table({'token': project.ksToken});
            let hooks = [];
            for(let i=0;i<project.hooks.length;i++){
                let hook = project.hooks[i];
                hooks.push({name: hook.name, description: hook.description, cpu: hook.cpu, mem: hook.mem, regexp: hook.regexp})
            }
            console.log('Hooks');
            console.table(hooks);
            let acls = [];
            for(let i=0;i<project.acls.length;i++){
                let acl = project.acls[i];
                acls.push(acls.push({'name': acl.name, 'ro': acls.ro}));
            }
            console.log('ACLs');
            console.table(acls);
            console.log('Jobs');
            axios.get(args.host + '/stats/jobs/' + project._id, {headers: headers}).then(stats => {
                console.table(stats.data);
                process.exit(0);
            });
            //process.exit(0);
        }).catch(err => {console.error('Error:', err.message); process.exit(1)})
    }).catch(err => {
        console.error(err);
        process.exit(1);
    }) 
  });

  program
  .command('jobs')
  .option('--limit [value]', 'Limit number of results', 100)
  .option('--as [value]', 'Run request as [user], admin only', null)
  .option('--host [value]', 'Herodote server address https://xxx', 'https://herodote.genouest.org')
  .action(function (args) {
    let limit = 100;
    try {
        limit = parseInt(args.limit);
    } catch (err) {
        console.log('Invalid limit paramter, skipping...');
    }
    getToken().then((token) => {
        let headers = {'Authorization': 'bearer ' + token};
        if(args.as) {
            headers['x-herodote-bind'] = args.as;
        }
        axios.get(args.host + '/jobs' + '?limit=' + limit, {headers: headers}).then(res => {
            let jobsTable = [];
            let jobs = res.data.jobs;
            for(let i=0;i<jobs.length;i++){
                let job = jobs[i];
                jobsTable.push({
                    id: job.id,
                    user: job.user,
                    project: job.projectId,
                    file: job.file,
                    hook: job.hook.name,
                    start: dateConvert(job.start),
                    begin: dateConvert(job.begin),
                    end: dateConvert(job.end),
                    status: getStatus(job.status)

                })
            }
            console.table(jobsTable);

            process.exit(0);
        }).catch(err => {console.error('Something went wrong:', err.message); process.exit(1)})
    }).catch(err => {
        console.error(err);
        process.exit(1);
    }) 
  });

  program
  .command('project-jobs')
  .arguments('<projectId>')
  .option('--limit [value]', 'Limit number of results', 100)
  .option('--as [value]', 'Run request as [user], admin only', null)
  .option('--host [value]', 'Herodote server address https://xxx', 'https://herodote.genouest.org')
  .action(function (projectId, args) {
    let limit = 100;
    try {
        limit = parseInt(args.limit);
    } catch (err) {
        console.log('Invalid limit paramter, skipping...');
    }
    getToken().then((token) => {
        let headers = {'Authorization': 'bearer ' + token};
        if(args.as) {
            headers['x-herodote-bind'] = args.as;
        }
        console.log('call ',args.host)
        axios.get(args.host + '/jobs/' + projectId + '?limit=' + limit, {headers: headers}).then(res => {
            let jobsTable = [];
            let jobs = res.data.jobs;
            for(let i=0;i<jobs.length;i++){
                let job = jobs[i];
                jobsTable.push({
                    id: job.id,
                    user: job.user,
                    project: job.projectId,
                    file: job.file,
                    hook: job.hook.name,
                    start: dateConvert(job.start),
                    begin: dateConvert(job.begin),
                    end: dateConvert(job.end),
                    status: getStatus(job.status)

                })
            }
            console.table(jobsTable);

            process.exit(0);
        }).catch(err => {console.error('Something went wrong:', err.message); process.exit(1)})
    }).catch(err => {
        console.error(err);
        process.exit(1);
    }) 
  });

  program
  .command('job')
  .arguments('<projectId>')
  .arguments('<jobId>')
  .option('--as [value]', 'Run request as [user], admin only', null)
  .option('--host [value]', 'Herodote server address https://xxx', 'https://herodote.genouest.org')
  .action(function (projectId, jobId, args) {
    getToken().then((token) => {
        let headers = {'Authorization': 'bearer ' + token};
        if(args.as) {
            headers['x-herodote-bind'] = args.as;
        }
        axios.get(args.host + '/jobs/' + projectId + '/' + jobId, {headers: headers}).then(res => {
            let job = res.data.job;
            let jobInfo = {
                id: job.id,
                project: job.projectId,
                hook_name: job.hook.name,
                hook_description: job.hook.description,
                user: job.user,
                cpu: job.hook.cpu,
                mem: job.hook.mem,
                regexp: job.hook.regexp,
                executor: job.hook.executor,
                file: job.file,
                start: dateConvert(job.start),
                begin: dateConvert(job.begin),
                end: dateConvert(job.end),
                status: getStatus(job.status),
                // exit_code: job.code
            }
            console.table(jobInfo);

            process.exit(0);
        }).catch(err => {console.error('Error:', err.message); process.exit(1)})
    }).catch(err => {
        console.error(err);
        process.exit(1);
    }) 
  });

  program
  .command('job-delete')
  .arguments('<projectId>')
  .arguments('<jobId>')
  .option('--as [value]', 'Run request as [user], admin only', null)
  .option('--host [value]', 'Herodote server address https://xxx', 'https://herodote.genouest.org')
  .action(function (projectId, jobId, args) {
    getToken().then((token) => {
        let headers = {'Authorization': 'bearer ' + token};
        if(args.as) {
            headers['x-herodote-bind'] = args.as;
        }
        axios.delete(args.host + '/jobs/' + projectId + '/' + jobId, {headers: headers}).then(res => {
            console.log('job tagged as killed');
            process.exit(0);
        }).catch(err => {console.error('Error:', err.message); process.exit(1)})
    }).catch(err => {
        console.error(err);
        process.exit(1);
    }) 
  });


  program
  .command('ban')
  .option('--project [value]', 'Project name', null)
  .option('--as [value]', 'Run request as [user], admin only', null)
  .option('--host [value]', 'Herodote server address https://xxx', 'https://herodote.genouest.org')
  .action(function (args) {
    if (args.project == null) {
        console.log('project is missing');
        process.exit(1);
    }
    getToken().then((token) => {
        let headers = {'Authorization': 'bearer ' + token};
        if(args.as) {
            headers['x-herodote-bind'] = args.as;
        }

        axios.put(args.host + '/projects/' + args.project + '/acls', {}, {headers: headers}).then(res => {
            console.log('Owner token regenerated, ban previous token');
            process.exit(0);
        }).catch(err => {
            console.error(err.message);
            process.exit(1);            
        })
    }).catch(err => {
        console.error(err);
        process.exit(1);
    }) 
  });

console.log('You can override authentication TOKEN via the HERO_TOKEN environement variable')
console.log('Job queries can be accessed via the ACL token, all other calls need an account and prior login call')
program.parse(process.argv);

var NO_COMMAND_SPECIFIED = program.args.length === 0;

if (NO_COMMAND_SPECIFIED) {
      program.help()
}