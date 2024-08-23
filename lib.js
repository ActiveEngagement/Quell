const { exec } = require('child_process');
const simpleParser = require('mailparser').simpleParser;
const util = require('util');
const fs = require('fs').promises;
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

function extractLinks(content) {
    const linkRegex = /(?:<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>|href=["']([^"']+)["']|http[s]?:\/\/(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+)/g;
    const matches = [...content.matchAll(linkRegex)];
    const links = [];

    matches.forEach(match => {
        const link = match[1] || match[3] || match[0];
        const linkContent = match[2] ? match[2].trim() : '';
        let context = linkContent.replace(/<[^>]+>/g, '') || 'No text';

        if (linkContent.startsWith('<img')) {
            const imgSrc = linkContent.match(/src=["']([^"']*)/i)?.[1];
            context = imgSrc ? path.basename(imgSrc) : 'Image';
        }

        const existingLink = links.find(l => l.link === link);
        if (existingLink) {
            if (!existingLink.contexts.includes(context)) {
                existingLink.contexts.push(context);
            }
        } else {
            links.push({ link, contexts: [context] });
        }
    });

    return links.filter(({ link }) => !link.startsWith('mailto:') && !/\.(jpg|jpeg|png|gif|bmp|svg)$/i.test(link));
}

async function handleUpload(req, res) {
    let allContent;
    
    if (req.file) {
        // Handle .eml file upload
        const rawEmail = await fs.readFile(req.file.path, 'utf8');
        const parsed = await simpleParser(rawEmail);
        allContent = parsed.html || parsed.textAsHtml || parsed.text;
    } else {
        // Handle webhook data
        const db = new sqlite3.Database('./webhooks.db');
        const emailContent = await new Promise((resolve, reject) => {
            db.get('SELECT email_content FROM webhooks ORDER BY received_at DESC LIMIT 1', (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.email_content : null);
            });
        });
        db.close();
        
        if (!emailContent) {
            return res.status(404).json({ error: 'No webhook data found' });
        }
        allContent = emailContent;
    }

    const links = extractLinks(allContent);
    const processedLinks = await processLinks(links);
    
    res.json(processedLinks);
}


async function processLinks(links) {
    const processedLinks = {};
    for (const { link, contexts } of links) {
        console.log('Processing link:', link);
        const unwrappedLink = await unwrapLink(link);
        
        if (processedLinks[unwrappedLink]) {
            processedLinks[unwrappedLink].contexts.push(...contexts.filter(c => !processedLinks[unwrappedLink].contexts.includes(c)));
            if (!processedLinks[unwrappedLink].wrapperHistory.includes(link)) {
                processedLinks[unwrappedLink].wrapperHistory.push(link);
            }
        } else {
            processedLinks[unwrappedLink] = { 
                originalLink: unwrappedLink,
                contexts: contexts,
                wrapperHistory: [link]
            };
        }
    }
    
    // Calculate count based on number of contexts
    for (const info of Object.values(processedLinks)) {
        info.count = info.contexts.length;
    }
    
    return processedLinks;
}

const execPromise = util.promisify(exec);

async function unwrapLink(link) {
    try {
        const { stdout } = await execPromise(`curl -Ls -o /dev/null -w %{url_effective} "${link}"`);
        return stdout.trim();
    } catch (error) {
        console.log(`Unable to unwrap link: ${link}. Error: ${error.message}`);
        return link;
    }
}

module.exports = {
    extractLinks,
    handleUpload,
    processLinks,
    unwrapLink
};
