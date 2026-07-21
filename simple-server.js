var http = require('http');
var fs = require('fs');
var path = require('path');

var server = http.createServer(function (req, res) {
  var filePath = req.url.split('?')[0];
  if (filePath === '/') filePath = '/game.html';
  if (filePath === '/index.html') { res.writeHead(302, { Location: '/game.html' }); res.end(); return; }
  var fullPath = path.join(__dirname, filePath);

  var extMap = {
    '.html': 'text/html;charset=utf-8',
    '.js': 'application/javascript;charset=utf-8',
    '.css': 'text/css;charset=utf-8',
    '.json': 'application/json;charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg'
  };

  fs.readFile(fullPath, function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain;charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    var ext = path.extname(filePath);
    var contentType = extMap[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(3000, function () {
  console.log('Server running at http://localhost:3000/');
  console.log('Press Ctrl+C to stop the server');
});