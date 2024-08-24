const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const nunjucks = require('nunjucks');
const { Connection, OAuth2 } = require('jsforce');
const { handleUpload } = require('./lib');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const axios = require('axios');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.post('/webhook', async (req, res) => {
    try {
      console.log('Received webhook payload:', JSON.stringify(req.body, null, 2));
  
      const messageId = req.body.message.id;
      
      console.log(`Attempting to fetch message: ${messageId}`);
  
      const response = await axios.get(`https://public.missiveapp.com/v1/messages/${messageId}`, {
        headers: {
          'Authorization': `Bearer ${process.env.MISSIVE_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
  
      const emailContent = response.data.html_body || response.data.text_body || JSON.stringify(response.data);
  
      db.run('INSERT INTO webhooks (email_content) VALUES (?)', [emailContent], function(err) {
        if (err) {
          console.error('Error storing webhook:', err);
          res.status(500).send('Error storing webhook');
        } else {
          console.log('Webhook stored successfully');
          res.status(200).send('Webhook received and stored');
        }
      });
    } catch (error) {
      console.error('Error processing webhook:', error);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      res.status(500).send('Error processing webhook');
    }
  });


  app.get('/emails', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    db.all('SELECT id, received_at, email_content FROM webhooks ORDER BY received_at DESC LIMIT ? OFFSET ?', [limit, offset], (err, rows) => {
        if (err) {
            res.status(500).json({ error: 'Error fetching emails' });
        } else {
            const emails = rows.map(row => {
                const emailContent = JSON.parse(row.email_content);
                return {
                    id: row.id,
                    received_at: row.received_at,
                    subject: emailContent.messages.subject,
                    from: emailContent.messages.from_field.name
                };
            });

            db.get('SELECT COUNT(*) as count FROM webhooks', (err, countRow) => {
                if (err) {
                    res.status(500).json({ error: 'Error counting emails' });
                } else {
                    res.json({
                        emails: emails,
                        totalCount: countRow.count,
                        currentPage: page
                    });
                }
            });
        }
    });
});


app.get('/emails/:id', (req, res) => {
    db.get('SELECT email_content FROM webhooks WHERE id = ?', [req.params.id], (err, row) => {
        if (err) {
            res.status(500).json({ error: 'Error fetching email' });
        } else if (!row) {
            res.status(404).json({ error: 'Email not found' });
        } else {
            res.json({ email_content: row.email_content });
        }
    });
});

app.delete('/emails/:id', (req, res) => {
    db.run('DELETE FROM webhooks WHERE id = ?', [req.params.id], (err) => {
        if (err) {
            res.status(500).json({ error: 'Error deleting email' });
        } else {
            res.json({ message: 'Email deleted successfully' });
        }
    });
});
  
  

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

// Set up SQLite database
const db = new sqlite3.Database('./webhooks.db');

// Create table if not exists
db.run(`CREATE TABLE IF NOT EXISTS webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_content TEXT,
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

app.set('view engine', 'html');
app.set('views', path.resolve(__dirname, 'views'));


app.use(express.static('public'));
app.use(bodyParser.json());
app.use(session({
    store: new FileStore(),
    secret: process.env.SESSION_KEY,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.SECURE_COOKIE === 'true' }
}));

app.get('/', isAuthenticated, (req, res) => {
    res.render('index');
});

app.post('/upload', isAuthenticated, upload.single('emlFile'), (req, res) => {
    handleUpload(req, res).catch(error => {
        console.error('Error processing file:', error);
        res.status(500).send({ error: error.message });
    });
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.get('/oauth2/redirect', (req, res) => {
    res.redirect(oauth2.getAuthorizationUrl({
        scope: process.env.SF_SCOPE
    }));
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
        res.send(e.message);
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
