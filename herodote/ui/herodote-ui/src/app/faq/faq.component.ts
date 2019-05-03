import { Component, OnInit } from '@angular/core';
import { ConfigService } from '../config.service';

@Component({
  selector: 'app-faq',
  templateUrl: './faq.component.html',
  styleUrls: ['./faq.component.css']
})
export class FaqComponent implements OnInit {

  selectedTab: string = "about";
  support: string;
  privacy_url: string
  operator: string

  constructor(private configService: ConfigService) { }

  ngOnInit() {
    this.configService.get().subscribe(
      resp => {
        this.support = resp['config']['support']
        this.operator = resp['config']['operator']
        this.privacy_url = resp['config']['privacy_url']
      },
      err => console.log('failed to get config')
    );
  }

  setCollapsed(tab) {
    this.selectedTab = tab;
  }

  isCollapsed(tab) {
    if(tab == this.selectedTab) {
      return false;
    }
    return true;
  }

}
