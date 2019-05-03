import { Component, OnInit } from '@angular/core';
import { ProjectService, Project } from './project.service';
import { projection } from '@angular/core/src/render3';
import { routerNgProbeToken } from '@angular/router/src/router_module';
import { Router } from '@angular/router';

@Component({
  selector: 'app-project',
  templateUrl: './newproject.component.html',
  styleUrls: ['./newproject.component.css']
})
export class NewProjectComponent implements OnInit {

  project: Project
  projects: any[]

  msg: string

  constructor(
    private router: Router,
    private projectService: ProjectService
    ) {
      this.projects = [];
    }

  ngOnInit() {
    this.project = new Project();
    this.projectService.listKs().subscribe(
      resp => {
        this.projects = resp['ksProjects'];
        if(this.projects.length > 0) {
          this.project.ksProject = this.projects[0].id;
        }
      },
      err => console.log('failed to get services')
    )
    
  }

  create() {
    if (!this.project.ksProject) {
      this.msg = "Openstack project is missing";
      return;
    }    
    if (!this.project.name) {
      this.msg = "Name is missing";
      return;
    }
    if(!this.project.name.match(/^[a-zA-Z0-9_]+$/)) {
      this.msg ="name must be alphanumeric only (letter, number and underscore)";
      return;
    }
    this.projectService.create(this.project).subscribe(
      resp => {
        this.router.navigate(['/projects']);
      },
      err => {
        this.msg = err.error;
      }
    )
  }

}
