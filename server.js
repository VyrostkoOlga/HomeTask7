var session = require('express-session');
var handlebars = require('express-handlebars').create();
var http = require( 'http' );
var fs = require("fs");

var cookieParser = require('cookie-parser');
var csrf = require('csurf');
var bodyParser = require('body-parser');
var express = require('express');
var helmet = require('helmet');

var parseForm = bodyParser.urlencoded({ extended: false });
var csrfProtection = csrf({ cookie: true });

var app = express();

app.use(cookieParser());
app.use(session({
  secret: 'My super session secret',
  cookie: {
    httpOnly: true,
    secure: true
  }
}));

app.use( bodyParser.json( ) );
app.use(bodyParser.urlencoded({
  extended: true
}));

app.use( csrfProtection );

app.use(helmet.csp({
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self"],
  imgSrc: ["'self'"],
  connectSrc: ["'none'"],
  fontSrc: [],
  objectSrc: [],
  mediaSrc: [],
  frameSrc: []
}));
app.use(helmet.xssFilter());
app.use(helmet.hidePoweredBy({ setTo: 'this is secret' }));

app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');

var file = "messages.db";
var exists = fs.existsSync(file);

var counterFile = "counter.db";
var existsCounter = fs.existsSync(counterFile);

app.use(express.static(__dirname + '/public'));

var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database('messages.db');
db.serialize( function() {
    if ( !exists ) {
        db.run( 'CREATE table Messages(LetterTo varchar(50) NOT NULL, Message varchar(500) NOT NULL )');
    }
});
var dbCounter = new sqlite3.Database('counter.db');
db.serialize( function() {
    if ( !existsCounter ) {
        db.run( 'CREATE table Counter(Ip varchar(20) NOT NULL, Page varchar(50) NOT NULL )');
    }
});

// произвольный промежуточный вызов - middleware
app.use(function (req, res, next) {
    var stmt = db.prepare( 'INSERT INTO Counter VALUES( ?, ? )');
    stmt.run( req.connection.remoteAddress, req.url );
    stmt.finalize();
    
    //res.cookie('sessionid', '1', { httpOnly: true });
    //res.cookie( 'sessionId', '1', { secure: true } );
    next();
});

app.get('/', csrfProtection, function(req, res){
    res.render( 'index', {'token': req.csrfToken() } );
});

app.get('/messages/:name', function(req, res){
    var letters = [];
    var name = req.params.name.toString( );
    
    db.each( 'SELECT LetterTo, Message FROM messages WHERE LetterTo="' + name + '"', function(err, row) {
        letters.push( {LetterTo: row.LetterTo, LetterText: row.Message} );
  }, function(err, numrows) {
      res.render( 'messages', {'name': req.params.name, 'letters': letters } );
  });
});

app.post( '/', parseForm, csrfProtection, function( req, res ) {
    //console.log( req.csrfToken() );
    var to = req.body.to;
    var letter = req.body.letter;
    
    //console.log( "Got letter to " + to + " with text: " + letter );
    
    var stmt = db.prepare( 'INSERT INTO messages VALUES(?, ?)');
    stmt.run( to, letter );
    stmt.finalize();
    res.redirect('/');
});

app.get( '/counter', function( req, res ) {
    var counter = [];
    db.each( 'SELECT Ip, Page, count(*) AS n FROM Counter GROUP BY Ip, Page', function(err, row) {
        counter.push( {Ip: row.Ip, Page: row.Page, N: row.n} );
    }, function(err, numrows) {
      res.render( 'counter', {'counter': counter } );
    });
});

var server = app.listen(8000, function () {
  var host = server.address().address,
      port = server.address().port;
  console.log('Server running at http://%s:%s', host, port);
});