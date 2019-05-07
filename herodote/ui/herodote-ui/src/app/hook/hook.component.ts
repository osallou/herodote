import { Component, OnInit } from '@angular/core';
import { ProjectService } from '../project/project.service';
import { ActivatedRoute, Router } from '@angular/router';
import { CodemirrorService } from '@nomadreservations/ngx-codemirror';

import 'codemirror/mode/shell/shell';
import { ConfigService } from '../config.service';

@Component({
  selector: 'app-hook',
  templateUrl: './hook.component.html',
  styleUrls: ['./hook.component.css']
})
export class HookComponent implements OnInit {

  template: string
  msg: string
  hook: any = {}
  createProject: boolean = true
  hookId: string
  projectId: string
  project: any
  mirrorConfig: any = {
    mode: {
      name: 'shell'
    },
    lineNumbers: true,
    lineWrapping: true,
    tabSize: 2
  }
  codemirror: any
  executors: any[] = []
  extra: string = ""

  constructor(
    private projectService: ProjectService,
    private route: ActivatedRoute,
    private router: Router,
    private _codeMirror: CodemirrorService,
    private configService: ConfigService
  ) {
  }

  ngOnInit() {
    this._codeMirror.instance$.subscribe((editor) => {
      this.codemirror = editor;
    });

    this.template = `#!/bin/bash
set -e

# In case of error, trap error, send progress and clean directory
finish() {
  $SWIFTUPLOAD $JOBDIR/$JOBNAME.log --object-name result/$FILE/$JOBNAME/$JOBNAME.log
  $SENDHERODOTEPROGRESS 3
  rm -rf $WORKDIR/$JOBNAME
}
trap 'finish' ERR

# install swift-client if not installed or load it from environment if available
# yum install python3-swiftclient, apt-get install python3-swiftclient
# . /softs/local/env/envswift
# for Debian based, client is named python3-swift

$LOADSWIFTCLIENT
alias swift='python3-swift'
export HERODOTETOKEN=$HERODOTETOKEN
$SENDHERODOTEPROGRESS 1
WORKDIR=$PWD
export JOBDIR=$WORKDIR/$JOBNAME
mkdir $JOBDIR
cd $JOBDIR
mkdir -p data result script
# Download file x/y/z to data/z
$SWIFTDOWNLOAD $FILE --object-name data/$FILENAME
# Uncompress if needed
#tar xvfz data/$FILENAME -C $JOBDIR/data
{

#####################
# do some job here  #
#####################

} >$JOBDIR/$JOBNAME.log 2>&1
# mv results to ../result

$SWIFTUPLOAD $JOBDIR/$JOBNAME.log --object-name result/$FILE/$JOBNAME/$JOBNAME.log
if find $JOBDIR/result -mindepth 1 | read; then
    echo "push results"
    cd $JOBDIR/result
    tar cfvz $JOBNAME.tar.gz *
    cd $JOBDIR
    $SWIFTUPLOAD result/$JOBNAME.tar.gz --object-name result/$FILE/$JOBNAME/$JOBNAME.tar.gz
fi
$SENDHERODOTEPROGRESS 2
cd $WORKDIR
rm -rf $WORKDIR/$JOBNAME
`;
    this.route.params.subscribe(params => {
      let id = params['hookid'];
      this.projectId = params['id'];
      this.configService.get().subscribe(
        resp => {
          this.executors = resp['config']['executors'];
          this.projectService.get(this.projectId).subscribe(
            resp => {
              this.project = resp['project'];
              if(id) {
                this.hookId = id;
                // get hook
                this.createProject = false;
                for(let i=0;i<this.project.hooks.length;i++){
                  let hook = this.project.hooks[i];
                  if(hook.name == this.hookId) {
                    if(hook.extra===undefined){
                      hook.extra = [];
                    }
                    this.hook = hook;
                    break;
                  }
                }
              } else {
                this.hook.cpu = 1;
                this.hook.mem = 4;
                this.hook.script = this.template;
                this.hook.regexp = "^data/.*$";
                this.hook.executor = this.executors[0];
                this.hook.extra = [];
              }
            },
            err => {
              console.error('failed to fetch project ',this.projectId, err);
            }
          );
        },
        err => console.log('failed to get config')
      )

    });
  }

  addExtra() {
    this.hook.extra.push(this.extra);
    this.extra = "";
  }

  deleteExtra(extra) {
    let index = this.hook.extra.indexOf(extra);
    if(index >= 0) {
      this.hook.extra.splice(index, 1);
    }

  }

  create() {
    if(!this.hook.name || !this.hook.script){
      this.msg = "name or script is missing";
      return;
    }
    if(!this.hook.name.match(/^[a-zA-Z0-9_]+$/)) {
      this.msg = "name must be alphanumeric only (letter, number and underscore)";
      return;
    }
    if(this.hook.regexp == "") {
      this.msg = "Regexp must not be empty";
      return
    }
    if(this.project.hooks === undefined) {this.project.hooks = []}
    this.project.hooks.push(this.hook);
    this.projectService.update(this.project).subscribe(
      resp => {
        this.router.navigate(['/project', this.projectId, 'hook', this.hook.name]);
      },
      err => {
        this.msg = err.error;
        console.log('failed to update project', this.project)
      }
    )
  }

  update() {
    this.projectService.update(this.project).subscribe(
      resp => {
        this.msg = "Hook updated";
      },
      err => {
        this.msg = err.error;
        console.log('failed to update project', this.project)
      }
    )
  }

}
