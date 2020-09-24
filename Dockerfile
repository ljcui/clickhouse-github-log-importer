FROM node:14-slim
WORKDIR /usr/src

COPY package*.json ./
RUN npm --registry https://registry.npm.taobao.org install
COPY . .

EXPOSE 9238
CMD [ "npm", "run", "start-docker" ]
