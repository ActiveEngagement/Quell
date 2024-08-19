const express = require('express');
const multer = require('multer');
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
    const parsed = await simpleParser(req.file.path);
    
    console.log('Parsed email structure:', JSON.stringify(parsed, null, 2));

    const links = extractLinksRecursively(parsed);
    console.log('Extracted links:', links);
    const processedLinks = await processLinks(links);
    console.log('Processed links:', processedLinks);
    res.json(processedLinks);
}

function extractLinksRecursively(obj) {
    let links = [];
    if (typeof obj === 'string') {
        links = links.concat(extractLinks(obj));
    } else if (Array.isArray(obj)) {
        obj.forEach(item => links = links.concat(extractLinksRecursively(item)));
    } else if (typeof obj === 'object' && obj !== null) {
        Object.values(obj).forEach(value => links = links.concat(extractLinksRecursively(value)));
    }
    return links;
}


function extractLinks(content) {
    const linkRegex = /(?:https?:\/\/|www\.)[^\s"'<>]+/g;
    const links = content.match(linkRegex) || [];
    console.log('Extracted links count:', links.length);
    return links;
}

async function processLinks(links) {
    const processedLinks = {};
    for (const link of links) {
        console.log('Processing link:', link);
        let actualLink = link;
        const wrapperHistory = [link];
        while (isTrackingLink(actualLink)) {
            actualLink = await unwrapLink(actualLink);
            wrapperHistory.push(actualLink);
        }
        if (processedLinks[actualLink]) {
            processedLinks[actualLink].count++;
        } else {
            processedLinks[actualLink] = { count: 1, wrapperHistory };
        }
    }
    return processedLinks;
}

function isTrackingLink(link) {
    return link.includes('trkptrk.com') || link.includes('patriotmarketplace.net');
}

async function unwrapLink(link) {
    try {
        const response = await axios.head(link, { maxRedirects: 0 });
        return response.headers.location || link;
    } catch (error) {
        if (error.response && error.response.headers.location) {
            return error.response.headers.location;
        }
        console.error('Error unwrapping link:', error);
        return link;
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
