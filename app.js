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

        // Check if the webhook is for a closed conversation
        if (req.body.rule && req.body.rule.type === 'conversation_closed' && req.body.conversation) {
            const conversationId = req.body.conversation.id;
            
            // Delete the corresponding email from the database
            db.run('DELETE FROM webhooks WHERE email_content LIKE ?', [`%"conversation":{"id":"${conversationId}"%`], function(err) {
                if (err) {
                    console.error('Error deleting email:', err);
                    res.status(500).send('Error processing webhook');
                } else {
                    console.log(`Deleted email with conversation ID: ${conversationId}`);
                    res.status(200).send('Webhook processed successfully');
                }
            });
        } else {
            // Handle other webhook types (existing code)
            const messageId = req.body.message.id;
            
            console.log(`Attempting to fetch message: ${messageId}`);
        
            const response = await axios.get(`https://public.missiveapp.com/v1/messages/${messageId}`, {
                headers: {
                    'Authorization': `Bearer ${process.env.MISSIVE_API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });
        
            const emailContent = JSON.stringify(response.data);
        
            db.run('INSERT INTO webhooks (email_content) VALUES (?)', [emailContent], function(err) {
                if (err) {
                    console.error('Error storing webhook:', err);
                    res.status(500).send('Error storing webhook');
                } else {
                    console.log('Webhook stored successfully');
                    res.status(200).send('Webhook received and stored');
                }
            });
        }
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
    clientSecret: process.env.SF_CONSUMER_SECRET,
    redirectUri: process.env.SF_CALLBACK_URI
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

        req.session.user = {
            id: userInfo.id,
            organizationId: userInfo.organizationId,
            instanceUrl: conn.instanceUrl,
            accessToken: conn.accessToken
        };
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

app.get('/test', async (req, res) => {
    const contents = await fs.readFile('email.json');
    
    const buffer = Buffer.from(contents, "utf8");

    const simpleParser = require('mailparser').simpleParser;

    const json = JSON.parse(buffer.toString());

    let parsed = await simpleParser(json.messages.body);

    await fs.writeFile('email-parsed.json', JSON.stringify(parsed));
    
    res.send(parsed.text);
})

async function approveEmail(emailId, userDisplayName) {
    const emailData = await new Promise((resolve, reject) => {
        db.get('SELECT email_content FROM webhooks WHERE id = ?', [emailId], (err, row) => {
            if (err) reject(err);
            else if (!row) reject(new Error('Email not found'));
            else resolve(JSON.parse(row.email_content));
        });
    });

    const conversationId = emailData.messages.conversation.id;
    const allRecipients = [
        emailData.messages.from_field,
        ...(emailData.messages.to_fields || []),
        ...(emailData.messages.cc_fields || []),
        ...(emailData.messages.bcc_fields || [])
    ];

    const originalDate = new Date(emailData.messages.delivered_at * 1000);
    const formattedDate = originalDate.toLocaleString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true
    });

    // Prepare the subject line
    let subject = emailData.messages.subject || '';
    if (!subject.toLowerCase().startsWith('re:')) {
        subject = 'Re: ' + subject;
    }

    const replyBody = `
<p>Approved!</p>

<p>— ${userDisplayName}</p>

<br><br>

<div style="border-left: 1px solid #ccc; padding-left: 10px; margin-left: 10px;">
  <p>On ${formattedDate}, ${emailData.messages.from_field.name} (${emailData.messages.from_field.address}) wrote:</p>

  ${emailData.messages.body}
</div>`;

    try {
        const response = await axios.post('https://public.missiveapp.com/v1/drafts', {
            drafts: {
                send: true,
                subject: subject,  // Include the subject here
                body: replyBody,
                conversation: conversationId,
                from_field: {
                    name: "Approvals Team",
                    address: "approvals@actengage.com"
                },
                to_fields: allRecipients,
                references: [emailData.messages.email_message_id],
                in_reply_to: emailData.messages.email_message_id,
                close: true
            }
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.MISSIVE_API_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('Approval response:', response.data);
        return { success: true, message: 'Email approved and conversation closed.' };
    } catch (error) {
        console.error('Error approving email:', error.response ? error.response.data : error.message);
        throw error;
    }
}

app.post('/approve/:id', async (req, res) => {
    if (!req.session.user || !req.session.user.accessToken) {
        return res.status(401).json({ success: false, message: 'User not authenticated or missing access token' });
    }

    try {
        const userInfo = req.session.user;
        const userInfoUrl = `${userInfo.instanceUrl}/services/oauth2/userinfo`;

        const response = await axios.get(userInfoUrl, {
            headers: {
                'Authorization': `Bearer ${userInfo.accessToken}`,
                'X-PrettyPrint': '1'
            }
        });

        const displayName = response.data.display_name || response.data.name;
        console.log('User display name:', displayName);

        const result = await approveEmail(req.params.id, displayName);
        res.json(result);
    } catch (error) {
        console.error('Error in /approve/:id:', error);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/preview/:id', (req, res) => {
    db.get('SELECT email_content FROM webhooks WHERE id = ?', [req.params.id], (err, row) => {
        if (err) {
            res.status(500).send('Error fetching email');
        } else if (!row) {
            res.status(404).send('Email not found');
        } else {
            try {
                const emailContent = JSON.parse(row.email_content);
                const htmlContent = emailContent.messages.body || 'No content available';
                res.send(htmlContent);
            } catch (error) {
                console.error('Error parsing email content:', error);
                res.status(500).send('Error parsing email content');
            }
        }
    });
});

// Add this new test route
app.get('/test-display-name', async (req, res) => {
    if (!req.session.user || !req.session.user.accessToken) {
        return res.status(401).send('User not authenticated or missing access token');
    }

    try {
        const userInfo = req.session.user;
        console.log('User info:', {
            id: userInfo.id,
            organizationId: userInfo.organizationId,
            instanceUrl: userInfo.instanceUrl,
            // Add any other non-sensitive fields here
        });

        // Construct the correct URL
        const userInfoUrl = `${userInfo.instanceUrl}/services/oauth2/userinfo`;

        const response = await axios.get(userInfoUrl, {
            headers: {
                'Authorization': `Bearer ${userInfo.accessToken}`,
                'X-PrettyPrint': '1'
            }
        });

        const displayName = response.data.display_name || response.data.name;
        console.log('User display name:', displayName);
        res.send(`Display name: ${displayName}`);
    } catch (error) {
        console.error('Error fetching user info:', error);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        res.status(500).send('Error fetching user info');
    }
});

async function rejectEmail(emailId, reason, userDisplayName) {
    const emailData = await new Promise((resolve, reject) => {
        db.get('SELECT email_content FROM webhooks WHERE id = ?', [emailId], (err, row) => {
            if (err) reject(err);
            else if (!row) reject(new Error('Email not found'));
            else resolve(JSON.parse(row.email_content));
        });
    });

    const conversationId = emailData.messages.conversation.id;
    const allRecipients = [
        emailData.messages.from_field,
        ...(emailData.messages.to_fields || []),
        ...(emailData.messages.cc_fields || []),
        ...(emailData.messages.bcc_fields || [])
    ];

    const originalDate = new Date(emailData.messages.delivered_at * 1000);
    const formattedDate = originalDate.toLocaleString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true
    });

    let subject = emailData.messages.subject || '';
    if (!subject.toLowerCase().startsWith('re:')) {
        subject = 'Re: ' + subject;
    }

    const replyBody = `
<p>${reason}</p>

<p>— ${userDisplayName}</p>

<br><br>

<div style="border-left: 1px solid #ccc; padding-left: 10px; margin-left: 10px;">
  <p>On ${formattedDate}, ${emailData.messages.from_field.name} (${emailData.messages.from_field.address}) wrote:</p>

  ${emailData.messages.body}
</div>`;

    try {
        const response = await axios.post('https://public.missiveapp.com/v1/drafts', {
            drafts: {
                send: true,
                subject: subject,
                body: replyBody,
                conversation: conversationId,
                from_field: {
                    name: "Approvals Team",
                    address: "approvals@actengage.com"
                },
                to_fields: allRecipients,
                references: [emailData.messages.email_message_id],
                in_reply_to: emailData.messages.email_message_id,
                close: true
            }
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.MISSIVE_API_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('Rejection response:', response.data);
        return { success: true, message: 'Email rejected and conversation closed.' };
    } catch (error) {
        console.error('Error rejecting email:', error.response ? error.response.data : error.message);
        throw error;
    }
}

app.post('/reject/:id', async (req, res) => {
    if (!req.session.user || !req.session.user.accessToken) {
        return res.status(401).json({ success: false, message: 'User not authenticated or missing access token' });
    }

    try {
        const userInfo = req.session.user;
        const userInfoUrl = `${userInfo.instanceUrl}/services/oauth2/userinfo`;

        const response = await axios.get(userInfoUrl, {
            headers: {
                'Authorization': `Bearer ${userInfo.accessToken}`,
                'X-PrettyPrint': '1'
            }
        });

        const displayName = response.data.display_name || response.data.name;
        console.log('User display name:', displayName);

        const result = await rejectEmail(req.params.id, req.body.reason, displayName);
        res.json(result);
    } catch (error) {
        console.error('Error in /reject/:id:', error);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        res.status(500).json({ success: false, message: error.message });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));