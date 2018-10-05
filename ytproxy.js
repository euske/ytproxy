//  ytproxy.js
//
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

const PORT = 8000;
const DATADIR = './var';
const RANGE = /bytes=(\d+)(-\d+)?/i;
const YOUTUBE_DL = '/usr/bin/youtube-dl';

function getVideo(id) {
  return path.join(DATADIR, id+'.mp4');
}
function getJson(id) {
  return path.join(DATADIR, id+'.json');
}
function quote(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function serve(req, res) {
  const u = url.parse(req.url, true);
  if (req.method == 'GET' && u.pathname == '/') {
    console.log('index');
    res.writeHead(200, {'Content-Type': 'text/html; charset=UTF-8'});
    res.write('<!DOCTYPE html>\n');
    res.write('<html><head><meta charset="utf-8" />');
    res.write('<meta name="viewport" content="width=device-width, initial-scale=1" />');
    res.write('<title>ytproxy</title>');
    res.write('<style> table { border-collapse: collapse; } </style>');
    res.write('<body><h1>ytproxy</h1>');
    res.write('<form method=GET action="/load">URL: <input name=q> <input type=submit value="Go"></form>');
    res.write('<hr><table border><tr><th>Title</th></tr>');
    fs.readdir(DATADIR, {withFileTypes: true}, (err, files) => {
      for (let ent of files) {
        if (ent.isFile() && ent.name.endsWith('.json')) {
          const data = fs.readFileSync(path.join(DATADIR, ent.name));
          const d = JSON.parse(data);
          const id = d.id;
          if (fs.existsSync(getVideo(id))) {
            res.write('<tr><td><a href="/play?id='+id+'">');
            res.write(quote(d.title));
            res.write('</td></tr>');
          }
        }
      }
      res.end('</table></body></html>');
    });

  } else if (req.method == 'GET' && u.pathname == '/play') {
    const id = u.query.id;
    console.log('play:', id);
    res.writeHead(200, {'Content-Type': 'text/html; charset=UTF-8'});
    res.write('<!DOCTYPE html>\n');
    res.write('<html><head><meta charset="utf-8" />');
    res.write('<meta name="viewport" content="width=device-width, initial-scale=1" />');
    res.write('<title>'+id+'</title>');
    res.write('<style> video { width: 100%; } button { width: 80px; height: 40px; margin: 0.5em; } </style>');
    res.write('<body><a href="/">Bacj</a>');
    res.write('<div><video onclick="toggle()" id="video" controls autoplay>');
    res.write(' <source type="video/mp4" src="/video?id='+id+'">');
    res.write('</video></div>');
    res.write('<script>var tend = 0;\
function toggle() { if (video.paused) { video.play(); } else { video.pause(); } }\
function check() { if (0 < tend && tend <= video.currentTime) { video.pause(); tend = 0; } }\
function changed(v) { tend = (v == 0)? 0 : video.currentTime + v; }\
function setup() { setInterval(check, 1000); }\
</script>');
    res.write('<div style="width:100%;">\
<button onclick="video.currentTime-=15; video.play();">&lt;&lt; 15</button>\
<select id="sleep" onchange="changed(sleep.value)">\
<option value="0">None</option>\
<option value="10">10 min</option>\
<option value="15">15 min</option>\
<option value="30">30 min</option></select>\
<button onclick="video.currentTime+=15; video.play();">15 &gt;&gt;</button>\
</div>');
    res.end('</body></html>');

  } else if (req.method == 'GET' && u.pathname == '/video') {
    const id = u.query.id;
    const rs = RANGE.exec(req.headers.range);
    const path1 = getVideo(id);
    fs.stat(path1, (err, stat) => {
      const size = stat.size;
      let stream = null;
      if (rs) {
        let s = parseInt(rs[1]);
        if (s < 0) { s += size; }
        let e = rs[2]? parseInt(rs[2].substr(1)) : size;
        if (e < 0) { e += size; }
        console.log('video:', id, 'partial', s, e);
        let nbytes = e+1-s;
        res.writeHead(206, {
          'Content-Type': 'video/mp4',
          'Content-Length': nbytes,
          'Content-Range': ('bytes '+s+'-'+e+'/'+size),
        });
        stream = fs.createReadStream(path1, {start:s, end:e});
      } else {
        console.log('video:', id, 'full');
        res.writeHead(200, {
          'Content-Type': 'video/mp4',
          'Content-Length': size
        });
        stream = fs.createReadStream(path1);
      }
      stream.on('data', (chunk) => {
        res.write(chunk);
      });
      stream.on('end', () => {
        res.end('');
      });
    });

  } else if (req.method == 'GET' && u.pathname == '/load') {
    const q = u.query.q;
    console.log('load:', q);
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write('<!DOCTYPE html>\n');
    res.write('<html><head><meta charset="utf-8" />');
    res.write('<meta name="viewport" content="width=device-width, initial-scale=1" />');
    res.write('<body>');
    child_process.execFile(
      YOUTUBE_DL, ['-j', q], (err, stdout, stderr) => {
        if (err) throw err;
        const d = JSON.parse(stdout);
        const id = d.id;
        if (id) {
          console.log('save:', id);
          res.write('<h1>Downloading</h1><p>'+id);
          res.write('<p><a href="/">Bacj</a>');
          res.end('</body></html>');
          const path1 = getJson(id);
          if (!fs.existsSync(path1)) {
            fs.writeFile(path1, stdout, (err) => {
              if (err) throw err;
            });
            const child = child_process.spawn(
              YOUTUBE_DL, ['-q', '-f', 'mp4', '-o', '%(id)s.%(ext)s', q],
              {cwd: DATADIR, shell: false});
            child.on('exit', (code, signal) => {
              console.log('exit:', code);
            });
          }
        } else {
          res.write('<h1>Invalid URL</h1>');
          res.write('<p><a href="/">Bacj</a>');
          res.end('</body></html>');
        }
      });

  } else {
    res.writeHead(404, {'Content-Type': 'text/html'});
    res.end('<html><body>not found</body></html>');
  }
}

try {
  fs.mkdirSync(DATADIR);
} catch (err) {
}
http.createServer(serve).listen(PORT);
console.log('Listening at '+PORT+'...');
