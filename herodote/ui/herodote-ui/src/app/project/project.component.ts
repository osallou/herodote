import { Component, OnInit, Pipe, PipeTransform } from '@angular/core';
import { ProjectService, Project } from './project.service';
import { WebDriverLogger } from 'blocking-proxy/built/lib/webdriver_logger';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { ConfigService } from '../config.service';


@Pipe({ name: "formatBytes" })
export class FormatBytes implements PipeTransform {
  
  constructor() {
  }

  transform(bytes: number, fractionSize: number = 2): string {
    if(! bytes) return 'NaN';
    if(bytes == 0) return '0 Bytes';
    var k = 1024,
        sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
        i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(fractionSize)) + ' ' + sizes[i];
  }
}


@Component({
  selector: 'app-project',
  templateUrl: './project.component.html',
  styleUrls: ['./project.component.css']
})
export class ProjectComponent implements OnInit {

  project: Project = new Project()
  msg: string
  user: any
  swift_url: string = "https://genostack-api-swift.genouest.org"
  newAcl: string
  selectedAcl: any
  activePanel: string = "project"
  meta: any = null
  stats: any = {pending: 0, running: 0, done: 0}

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private projectService: ProjectService,
    private authService: AuthService,
    private configService: ConfigService
  ) {
  }

  isActive(tab) {
    if(this.activePanel == tab) {
      return true;
    }
    return false;
  }

  activatePanel(tab) {
    this.activePanel = tab;
  }

  ngOnInit() {
    this.user = this.authService.profile;
      this.route.params.subscribe(params => {
      let id = params['id'];
      this.projectService.get(id).subscribe(
        resp => {
          if(resp['meta']) {
            this.meta = resp['meta'].bucket || {};
          }
          if(resp['project'].acls === undefined) {
            resp['project'].acls = [];
          }
          if(resp['project'].hooks === undefined) {
            resp['project'].hooks = [];
          }
          this.project = resp['project'];
          this.projectService.jobStats(this.project._id).subscribe(
            stats => {
              this.stats = stats;
            }
          );
          this.showOwnerAcl();

        },
        err => {
          console.log('failed to get project');
        }
      )
   });
   this.configService.get().subscribe(
     resp => this.swift_url = resp['config']['swift_url'],
     err => console.log('failed to get config')
   )
    
  }

  showOwnerAcl() {
    this.selectedAcl = {
      name: this.user.uid,
      token: this.project.ksToken
    }
  }

  delete() {
    this.projectService.delete(this.project).subscribe(
      resp => {
        if(resp['error']) {
          this.msg = resp['msg'];
          return
        }
        this.router.navigate(['/projects'])
      },
      err => {
        console.log('failed to delete project');
        this.msg = err.error;
      }
    )
  }

  updateWebStatus() {
    this.projectService.web(this.project).subscribe(
      resp => {
        this.msg = resp['msg'];
        this.project = resp['project']
      },
      err => {
        console.log('failed to update project web browsing option');
        this.msg = err.error;       
      }
    )
  }

  showAcl(acl) {
    this.selectedAcl = acl;
  }

  addAcl() {
    this.project.acls.push({name: this.newAcl, token: ""});
    this.projectService.update(this.project).subscribe(
      resp => {this.project = resp['project']},
      err => {
        this.msg = err.error;
        console.log('failed to update project');
      }
    )
    this.newAcl = '';
  }

  update() {
    this.projectService.update(this.project).subscribe(
      resp => {this.project = resp['project']},
      err => {
        this.msg = err.error;
        console.log('failed to update project');
      }
    )   
  }

  banAcl(acl) {
    this.selectedAcl = null;
    for(let i=0;i<this.project.acls.length; i++) {
      let aclElt = this.project.acls[i];
      if(aclElt.name == acl.name) {
        this.project.acls.splice(i, 1);
        break;
      }
    }
    this.projectService.update(this.project).subscribe(
      resp => {this.project = resp['project']},
      err => {
        this.msg = err.error;
        console.log('failed to update project');
      }
    )
  }

  deleteHook(hook) {
    for(let i=0;i<this.project.hooks.length; i++) {
      let hooklElt = this.project.hooks[i];
      if(hooklElt.name == hook.name) {
        this.project.hooks.splice(i, 1);
        break;
      }
    }
    this.projectService.update(this.project).subscribe(
      resp => {this.project = resp['project']},
      err => {
        this.msg = err.error;
        console.log('failed to update project');
      }
    )
  }
 
}
