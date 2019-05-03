import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AuthGuard } from './auth/auth.guard';
import { LoginComponent } from './auth/login/login.component';
import { LogoutComponent } from './auth/logout/logout.component';
import { UserComponent } from './user/user.component';
import { NewProjectComponent } from './project/newproject.component';
import { ProjectComponent } from './project/project.component';
import { HookComponent } from './hook/hook.component';
import { JobComponent } from './job/job.component';
import { FaqComponent } from './faq/faq.component';

const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent
  }, 
  {
    path: 'logout',
    component: LogoutComponent
  },
  {
    path: 'projects',
    component: UserComponent,
    canActivate: [
      AuthGuard
    ]
  },
  {
    path: 'project',
    component: NewProjectComponent,
    canActivate: [
      AuthGuard
    ]
  },
  {
    path: 'project/:id',
    component: ProjectComponent,
    canActivate: [
      AuthGuard
    ]
  },
  {
    path: 'project/:id/hook',
    component: HookComponent,
    canActivate: [
      AuthGuard
    ]
  },
  {
    path: 'project/:id/hook/:hookid',
    component: HookComponent,
    canActivate: [
      AuthGuard
    ]
  },
  {
    path: 'project/:id/job',
    component: JobComponent,
    canActivate: [
      AuthGuard
    ]
  },
  {
    path: 'faq',
    component: FaqComponent
  },   
];

@NgModule({
  imports: [RouterModule.forRoot(
    routes,
    { enableTracing: false } // <-- debugging purposes only
   )],
  exports: [RouterModule],
  providers: [AuthGuard]
})
export class AppRoutingModule { }
