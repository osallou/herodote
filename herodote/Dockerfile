FROM node:12-buster
LABEL Author="Olivier Sallou <olivier.sallou@irisa.fr>"


RUN mkdir -p /root/herodote
WORKDIR /root/herodote


COPY *.json  /root/herodote/
RUN npm install
COPY *.js /root/herodote/

RUN mkdir bin public routes views lib ui config
COPY config/default.yml.template /root/herodote/config
RUN mv /root/herodote/config/default.yml.template /root/herodote/config/default.yml
COPY config/custom-environment-variables.yaml /root/herodote/config
COPY public /root/herodote/public
COPY bin /root/herodote/bin
COPY routes /root/herodote/routes
COPY views /root/herodote/views
COPY lib /root/herodote/lib
COPY ui /root/herodote/ui

RUN npm install -g @angular/cli
RUN cd /root/herodote/ui/herodote-ui && npm install && ng build --base-href /ui/ --prod && rm -rf src && rm -rf node_modules

EXPOSE 3000
#For webapp: ENTRYPOINT node bin/herodote-server
#For jobreceiver process: ENTRYPOINT node jobReceiver.js
