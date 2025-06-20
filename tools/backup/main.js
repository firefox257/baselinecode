///////////////////

var WebServer = require('./server/webServer.js')

var web = new WebServer({ additionalMethods: ['SQL'] })

//webAppReady()
console.log('Ready' + __dirname)
