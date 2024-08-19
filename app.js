const express = require('express');
const multer = require('multer');
const simpleParser = require('mailparser').simpleParser;
const axios = require('axios');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));

app.post('/upload', upload.single('emlFile'), async (req, res) => {
    try {
        const file = req.file;
        const parsed = await simpleParser(file.path);
        const links = extractLinks(parsed.html);
        const processedLinks = await processLinks(links);
        res.json(processedLinks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

function extractLinks(html) {
    const linkRegex = /<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>/g;
    const links = [];
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
        links.push(match[1]);
    }
    return links;
}

async function processLinks(links) {
    const processedLinks = {};
    for (const link of links) {
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
    // Implement logic to detect tracking links
    return link.includes('trackingservice.com');
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
