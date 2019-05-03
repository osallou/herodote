import { Component, OnInit } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { ProjectService } from '../project/project.service';

@Component({
  selector: 'app-user',
  templateUrl: './user.component.html',
  styleUrls: ['./user.component.css']
})
export class UserComponent implements OnInit {

  session_user: any
  projects: any[] = []

  constructor(
    private authService: AuthService,
    private projectService: ProjectService

  ) {
    this.session_user = this.authService.profile
  }

  ngOnInit() {
    this.projectService.list().subscribe(
      resp =>{
        if(resp['projects']) {
          this.projects = resp['projects'];
        }
      },
      err => {console.log('Error', err);}
    )
  }

}
