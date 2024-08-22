const express = require('express');
const session = require('express-session')
const FileStore = require('session-file-store')(session);
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const nunjucks = require('nunjucks')
const { Connection, OAuth2 } = require('jsforce');
const { handleUpload } = require('./lib');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const oauth2 = new OAuth2({
    clientId: process.env.SF_CONSUMER_KEY,
    clientSecret: process.SF_CONSUMER_SECRET,
    redirectUri: process.env.SF_LOGIN_URL
});

const upload = multer({ dest: 'uploads/' });

nunjucks.configure('views', {
    autoescape: true,
    express: app
});

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
}

app.set('view engine', 'html')
app.set('views', path.resolve(__dirname, 'views'));

app.use(express.static('public'));

app.use(session({
    store: new FileStore(),
    secret: process.env.SESSION_KEY,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.SECURE_COOKIE === 'true' }
}))

app.get('/', isAuthenticated, (req, res) => {
    res.render('index') 
});

app.post('/upload', isAuthenticated, upload.single('emlFile'), (req, res) => {
    handleUpload(req, res).catch(error => {
        console.error('Error processing file:', error);
        res.status(500).send({ error: error.message });
    });
});

app.get('/login', (req, res) => {
    res.render('login')
});

app.get('/oauth2/redirect', (req, res) => {
    res.redirect(oauth2.getAuthorizationUrl({
        scope: process.env.SF_SCOPE
    }))
});

app.get('/oauth2/callback', async (req, res) => {
    const conn = new Connection({ oauth2 : oauth2 });
  
    try {
        const userInfo = await conn.authorize(req.query.code);

        req.session.user = userInfo;
        req.session.save(() => res.redirect('/'));
    }
    catch(e) {
        res.status(401);
        res.send(e.message)
    }
});

app.get('/r', async (req, res) => {
    try {
        const directory = 'uploads';
        const files = await fs.readdir(directory);
        for (const file of files) {
            await fs.unlink(path.join(directory, file));
        }
        res.send('Uploads folder cleared successfully');
    } catch (error) {
        console.error('Error clearing uploads folder:', error);
        res.status(500).send('Error clearing uploads folder');
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
