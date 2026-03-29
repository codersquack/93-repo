import { fs } from "/42/api/fs.js"
import { confirm } from "/42/ui/layout/dialog.js"

function cleanSegment(value) {
    return String(value || '')
        .trim()
        .replace(/^\/+|\/+$/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getRepoId(repoUrl) {
    try {
        const parsed = new URL(String(repoUrl || ''));
        const host = cleanSegment(parsed.host || 'repo');
        const path = cleanSegment(parsed.pathname || '');
        return path ? `${host}_${path.replace(/\//g, '_')}` : host;
    } catch (error) {
        return cleanSegment(repoUrl || 'repo');
    }
}

function getAppId(appManifest, appPath) {
    const fromManifest = appManifest?.slug || appManifest?.command || appManifest?.name;
    return cleanSegment(appPath || fromManifest || 'app');
}

export function getInstallPath(repoUrl, appPath, appManifest) {
    const repoId = getRepoId(repoUrl);
    const appId = getAppId(appManifest, appPath);
    return `/c/programs/appstore/${repoId}/${appId}`;
}

function joinUrl(base, ...parts) {
    let url = String(base || '').replace(/\/+$/, '');

    for (const part of parts) {
        url += `/${String(part || '').replace(/^\/+|\/+$/g, '')}`;
    }

    return url;
}

function joinPath(base, ...parts) {
    let target = String(base || '').replace(/\/+$/, '');

    for (const part of parts) {
        target += `/${String(part || '').replace(/^\/+|\/+$/g, '')}`;
    }

    return target;
}

function leftRotate(value, shift) {
    return (value << shift) | (value >>> (32 - shift));
}

function md5(input) {
    const text = unescape(encodeURIComponent(String(input)));
    const messageLength = text.length;
    const words = [];

    for (let index = 0; index < messageLength; index += 1) {
        words[index >> 2] = words[index >> 2] || 0;
        words[index >> 2] |= text.charCodeAt(index) << ((index % 4) * 8);
    }

    words[messageLength >> 2] = words[messageLength >> 2] || 0;
    words[messageLength >> 2] |= 0x80 << ((messageLength % 4) * 8);
    words[(((messageLength + 8) >> 6) + 1) * 16 - 2] = messageLength * 8;

    let a = 0x67452301;
    let b = 0xefcdab89;
    let c = 0x98badcfe;
    let d = 0x10325476;

    const shifts = [
        7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
        5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
        4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
        6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
    ];

    const constants = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000));

    for (let i = 0; i < words.length; i += 16) {
        let aa = a;
        let bb = b;
        let cc = c;
        let dd = d;

        for (let j = 0; j < 64; j += 1) {
            let f;
            let g;

            if (j < 16) {
                f = (bb & cc) | (~bb & dd);
                g = j;
            } else if (j < 32) {
                f = (dd & bb) | (~dd & cc);
                g = (5 * j + 1) % 16;
            } else if (j < 48) {
                f = bb ^ cc ^ dd;
                g = (3 * j + 5) % 16;
            } else {
                f = cc ^ (bb | ~dd);
                g = (7 * j) % 16;
            }

            const temp = dd;
            dd = cc;
            cc = bb;
            bb = (bb + leftRotate((aa + f + constants[j] + (words[i + g] || 0)) >>> 0, shifts[j])) >>> 0;
            aa = temp;
        }

        a = (a + aa) >>> 0;
        b = (b + bb) >>> 0;
        c = (c + cc) >>> 0;
        d = (d + dd) >>> 0;
    }

    function toHex(num) {
        return [num & 0xff, (num >>> 8) & 0xff, (num >>> 16) & 0xff, (num >>> 24) & 0xff]
            .map((value) => value.toString(16).padStart(2, '0'))
            .join('');
    }

    return `${toHex(a)}${toHex(b)}${toHex(c)}${toHex(d)}`;
}

function parseManifestText(text) {
    if (window.JSON5 && typeof windo === 'function') {
        return windo(text);
    }

    return JSON.parse(text);
}

function stringifyManifest(manifest) {
    if (window.JSON5 && typeof window.JSON5.stringify === 'function') {
        return window.JSON5.stringify(manifest, null, 2);
    }

    return JSON.stringify(manifest, null, 2);
}

function makeUniqueSlug(baseSlug) {
    const hash = md5(Math.random());
    return `${cleanSegment(baseSlug)}-${hash}`;
}

function withUniqueManifestSlug(content, appManifest, appPath) {
    try {
        const parsed = parseManifestText(content);
        const baseSlug = parsed?.slug || appManifest?.slug || appManifest?.command || appPath || 'app';
        parsed.slug = makeUniqueSlug(baseSlug);
        return stringifyManifest(parsed);
    } catch (error) {
        return content;
    }
}

function normalizeFileList(appFiles) {
    if (!Array.isArray(appFiles)) {
        return [];
    }

    return appFiles
        .map((file) => String(file || '').trim())
        .filter(Boolean);
}

function getSentinelFile(appFiles) {
    const normalized = normalizeFileList(appFiles);
    if (normalized.includes('app.manifest.json5')) {
        return 'app.manifest.json5';
    }

    return normalized[0] || null;
}

function resolveFs() {
    const candidates = [];

    if (typeof window !== 'undefined') {
        candidates.push(window.sys42);

        try {
            if (window.parent && window.parent !== window) {
                candidates.push(window.parent.sys42);
            }
        } catch (error) {
        }

        try {
            if (window.top) {
                candidates.push(window.top.sys42);
            }
        } catch (error) {
        }
    }

    for (const sys42 of candidates) {
        if (sys42 && sys42.fs) {
            return sys42.fs;
        }
    }

    return null;
}


export async function isInstalled(repoUrl, appPath, appManifest, appFiles) {
    const installBasePath = getInstallPath(repoUrl, appPath, appManifest);
    const sentinel = getSentinelFile(appFiles);

    if (!sentinel) {
        return false;
    }

    const installedManifestPath = joinPath(installBasePath, sentinel);
    return Boolean(await fs.isFile(installedManifestPath));
}

async function writeFileToFs(fs, targetPath, content) {
    if (typeof fs.write === 'function') {
        await fs.write(targetPath, content);
        return;
    }

    if (typeof fs.writeFile === 'function') {
        await fs.writeFile(targetPath, content);
        return;
    }

    throw new Error('sys42.fs.write is not available');
}

async function removeFileFromFs(fs, targetPath) {
    if (typeof fs.delete === 'function') {
        await fs.delete(targetPath);
        return;
    }

    if (typeof fs.unlink === 'function') {
        await fs.unlink(targetPath);
        return;
    }

    if (typeof fs.removeFile === 'function') {
        await fs.removeFile(targetPath);
        return;
    }

    if (typeof fs.rm === 'function') {
        await fs.rm(targetPath);
        return;
    }

    throw new Error('No supported file removal method found on sys42.fs');
}

export async function installApp(appManifest, repoUrl, appPath, appFiles) {
    const installBasePath = getInstallPath(repoUrl, appPath, appManifest);
    const files = normalizeFileList(appFiles);

    if (files.length === 0) {
        throw new Error('No files listed for this app');
    }

    for (const file of files) {
        const sourceUrl = joinUrl(repoUrl, appPath, file);
        const response = await fetch(sourceUrl);

        if (!response.ok) {
            throw new Error(`Failed to fetch ${sourceUrl}`);
        }

        let content = await response.text();
        if (String(file).toLowerCase().endsWith('app.manifest.json5')) {
            content = withUniqueManifestSlug(content, appManifest, appPath);
        }
        const targetPath = joinPath(installBasePath, file);
        await writeFileToFs(fs, targetPath, content);
    }

    // if (!("desktop" in appManifest)) {

    // }
    // let createDesktop = "desktop" in appManifest ? appManifest.desktop : await confirm("Would you like to create a desktop shortcut?", {agree: "Yes", decline: "No"}) // could be not correct
    let createDesktop = await confirm("Would you like to create a desktop shortcut?", {agree: "Yes", decline: "No"})
    if(createDesktop) createDesktopIcon(appManifest.name, appManifest.command)

    return installBasePath;
}

async function createDesktopIcon(name, command) {
    // await fs.write("")
    let users = await fs.readJSON5("/users.json5")
    await fs.writeText(`/c/users/${users.activeUser}/desktop/${command}.desktop`, `[Desktop Entry]\nName="${name}"\nExec="${command}"`)
}

export async function uninstallApp(appManifest, repoUrl, appPath, appFiles) {
    const installBasePath = getInstallPath(repoUrl, appPath, appManifest);

    let users = await fs.readJSON5("/users.json5")
    console.log(`/c/users/${users.activeUser}/desktop/${appManifest.command}.desktop`)
    if (await fs.isFile(`/c/users/${users.activeUser}/desktop/${appManifest.command}.desktop`)) {
        await fs.delete(`/c/users/${users.activeUser}/desktop/${appManifest.command}.desktop`)
    }

    if (typeof fs.deleteDir === 'function') {
        await fs.deleteDir(installBasePath);
        return installBasePath;
    }

    const files = normalizeFileList(appFiles);
    for (const file of files) {
        const targetPath = joinPath(installBasePath, file);
        try {
            await removeFileFromFs(fs, targetPath);
        } catch (error) {
        }
    }

    return installBasePath;
}