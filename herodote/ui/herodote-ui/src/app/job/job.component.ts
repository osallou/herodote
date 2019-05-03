import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ProjectService } from '../project/project.service';
import { AuthService } from '../auth/auth.service';
import { JobService } from './job.service';

@Component({
  selector: 'app-job',
  templateUrl: './job.component.html',
  styleUrls: ['./job.component.css']
})
export class JobComponent implements OnInit {

  user: any
  project: any
  jobs: any[] = []
  nbJobs: number = 0
  page: number = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private projectService: ProjectService,
    private authService: AuthService,
    private jobService: JobService
  ) { }

  ngOnInit() {
    this.user = this.authService.profile;
    this.route.params.subscribe(params => {
      let id = params['id'];
      this.projectService.get(id).subscribe(
        resp => {
          this.project = resp['project'];
          this.jobService.list(this.project._id, this.page).subscribe(
            resp => this.jobs = resp['jobs'],
            err => console.log('failed to get jobs')
          )
          this.jobService.count(this.project._id).subscribe(
            resp => {
              this.nbJobs = parseInt(resp.headers.get('X-HERODOTE-JOBS'));
            },
            err => console.log('failed to get jobs count')
          )
        },
        err => {
          console.log('failed to get project')
        }
      );
    });
  }

  prevPage() {
    if(this.page > 0){
      this.page--;
      this.showJobs();
    }
  }

  maxPage() {
    return Math.min((this.page+1) * 30, this.nbJobs)
  }

  nextPage() {
    if(((this.page + 1) * 30) < this.nbJobs){
      this.page++;
      this.showJobs();
    }
  }

  showJobs() {
    this.jobService.list(this.project._id, this.page).subscribe(
      resp => this.jobs = resp['jobs'],
      err => console.log('failed to get jobs')
    )  
  }


  status(s) {
    let sclass = "";
    switch(s) {
      case 0:
        sclass = "alert alert-secondary";
        break;
      case 1:
        sclass = "alert alert-primary";
        break;
      case 2:
        sclass = "alert alert-success";
        break;
      case 3:
        sclass = "alert alert-danger";
        break;
    }
    return sclass;
  }

  dateConvert = function timeConverter(tsp){
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

}
