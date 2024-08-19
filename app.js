const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const simpleParser = require('mailparser').simpleParser;
const axios = require('axios');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));

app.post('/upload', upload.single('emlFile'), (req, res) => {
    handleUpload(req, res).catch(error => {
        console.error('Error processing file:', error);
        res.status(500).send({ error: error.message });
    });
});

async function handleUpload(req, res) {
    console.log('File received:', req.file);
    
    const rawEmail = await fs.readFile(req.file.path, 'utf8');
    console.log('Raw email content preview:', rawEmail.slice(0, 200));

    const parsed = await simpleParser(rawEmail);
    
    let allContent = [
        parsed.text,
        parsed.html,
        parsed.textAsHtml,
        JSON.stringify(parsed.headers),
        parsed.subject,
        parsed.from ? parsed.from.text : '',
        parsed.to ? parsed.to.text : '',
        parsed.cc ? parsed.cc.text : '',
        parsed.bcc ? parsed.bcc.text : '',
        ...parsed.attachments.map(att => att.content.toString())
    ].join(' ');

    console.log('Combined content preview:', allContent.slice(0, 200));
    
    const links = extractLinks(allContent);
    console.log('Extracted links:', links);
    const processedLinks = await processLinks(links);
    console.log('Processed links:', processedLinks);
    res.json(processedLinks);
}

function extractLinks(content) {
    const linkRegex = /(https?:\/\/[^\s<>"']+(?:\?[^\s<>"']+)?)/g;
    const links = content.match(linkRegex) || [];
    console.log('Extracted links count:', links.length);
    return links;
}

function parseURL(url) {
    const parsedURL = new URL(url);
    const baseURL = `${parsedURL.protocol}//${parsedURL.hostname}${parsedURL.pathname}`;
    const params = Object.fromEntries(parsedURL.searchParams);
    return { baseURL, params };
}


async function processLinks(links) {
    const processedLinks = {};
    for (const link of links) {
        console.log('Processing link:', link);
        if (processedLinks[link]) {
            processedLinks[link].count++;
        } else {
            const wrapperHistory = [link];
            if (isTrackingLink(link)) {
                const unwrappedLink = await unwrapLink(link);
                if (unwrappedLink !== link) {
                    wrapperHistory.push(unwrappedLink);
                }
            }
            processedLinks[link] = { 
                originalLink: link,
                count: 1, 
                wrapperHistory 
            };
        }
    }
    return processedLinks;
}




function isTrackingLink(link) {
    return link.includes('trkptrk.com') || link.includes('patriotmarketplace.net');
}

async function unwrapLink(link) {
    try {
        const response = await axios.head(link, { maxRedirects: 0, timeout: 5000 });
        return response.headers.location || link;
    } catch (error) {
        if (error.response && error.response.headers.location) {
            return error.response.headers.location;
        }
        console.log(`Unable to unwrap link: ${link}. Error: ${error.message}`);
        return link;
    }
}


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
