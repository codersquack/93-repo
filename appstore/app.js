import { getInstallPath, isInstalled, installApp, uninstallApp } from "./appInstaller.js"
import { JSON5 } from "/42/formats/data/JSON5.js";
import { fs } from "/42/api/fs.js"
import { configure } from "/42/api/configure.js"

let statusEl;
let appsContainer;

const REPO_LIST_URL = 'https://repo93.xd4y.zip/';
const MANIFEST_FILE = 'manifest.json';
const APP_MANIFEST_FILE = 'app.manifest.json5';

async function fetchIcon(manifest, base, path, files) {
    // let icon = "/42/assets/icons/32x32/apps/generic.png"
    if (manifest.icons !== null && manifest.icons !== undefined){
        console.log(manifest.icons)
        let obj = manifest.icons.find((obj)=>{return obj.size == 32})
        if (obj) {
            if (obj.url.startsWith("/")) return obj.url
            else return base+"/"+path+"/"+obj.url // TODO: test
        }
    }
    if (files.includes("icon-32.png")) return base+"/"+path+"/icon-32.png"
    if (files.includes("icons/icon-32.png")) return base+"/"+path+"/icons/icon-32.png"

    return "/42/assets/icons/32x32/apps/generic.png"

    // if (files.)
}

async function createAppCard(manifest, repoDisplayUrl, repoFetchBaseUrl, appPath, appFiles) {
    let icon = await fetchIcon(manifest, repoFetchBaseUrl, appPath, appFiles)

    sys42.render({
        "tag": "fieldset",
        content: [
            {
                tag: "img",
                width: 32,
                height: 32,
                src: icon
            },

            {
                tag: "b",
                style: "margin-left: 10px;",
                content: manifest.name+" " 
            },
            {
                tag: "span",
                style: "display: inline list-item; color: inherit;",
                href: repoDisplayUrl,
                content: repoDisplayUrl,
                target: "__blank"
            },
            {
                tag: "span.block",
                content: manifest.description
            },
            {
                tag: "button.block",
                content: "Install",
                action: async (e)=>{
                    e.target.disabled = true
                    const installed = await isInstalled(repoFetchBaseUrl, appPath, manifest, appFiles);
                    try {

                        if (installed) { // TODO: turn in progress bars
                            e.target.textContent = "Uninstalling..."
                            await uninstallApp(manifest, repoFetchBaseUrl, appPath, appFiles);
                        } else {
                            e.target.textContent = "Installing..."
                            await installApp(manifest, repoFetchBaseUrl, appPath, appFiles);
                        }
                    } catch (err) {
                        sys42.alert(`Something went wrong! ${err}`)
                    } finally {
                        if (installed) e.target.textContent = "Install" // installed value is opposite of truth
                        else e.target.textContent = "Uninstall"
                        e.target.disabled = false
                    }
                }
            }
        ]
    }, appsContainer)
}


function normalizeRepoUrl(url) {
    return String(url || '').replace(/\/+$/, '');
}

function resolveRepoFetchBaseUrl(repoUrl) {
    const normalized = normalizeRepoUrl(repoUrl);
    return normalized;
}

function normalizeAppPath(pathValue) {
    return String(pathValue || '').replace(/^\/+|\/+$/g, '');
}

async function loadApps() {
    appsContainer.innerHTML = ""
    statusEl.textContent = "loading..."
    try {
        const repoResponse = await fetch(REPO_LIST_URL);

        if (!repoResponse.ok) {
            throw new Error(`Failed to fetch repo list (${repoResponse.status})`);
        }

        let defaultRepos = await repoResponse.json();

        if (!Array.isArray(defaultRepos)) {
            throw new Error('Repo list response is not an array');
        }

        const extraRepos = await fs.readJSON("/c/programs/appstore/repos.json")
        if (extraRepos == null) {
            throw new Error('Couldn\'t read new repos');
        }

        // const repos = defaultRepos.concat(extraRepos)
        const repos = extraRepos

        let foundApps = 0;
        let failedRepos = 0;
        let failedApps = 0;

        for (const repo of repos) {
            const repoDisplayUrl = normalizeRepoUrl(repo);
            const repoFetchBaseUrl = resolveRepoFetchBaseUrl(repoDisplayUrl);
            const manifestUrl = `${repoFetchBaseUrl}/${MANIFEST_FILE}`;

            try {
                const manifestResponse = await fetch(manifestUrl);

                if (!manifestResponse.ok) {
                    failedRepos += 1;
                    continue;
                }

                const repoManifestText = await manifestResponse.text();
                const repoManifest = JSON5.parse(repoManifestText);

                if (!repoManifest || typeof repoManifest !== 'object' || Array.isArray(repoManifest)) {
                    failedRepos += 1;
                    continue;
                }

                for (const [appPathRaw, appFiles] of Object.entries(repoManifest)) {
                    if (!Array.isArray(appFiles) || !appFiles.includes(APP_MANIFEST_FILE)) {
                        continue;
                    }

                    const appPath = normalizeAppPath(appPathRaw);
                    const appManifestUrl = `${repoFetchBaseUrl}/${appPath}/${APP_MANIFEST_FILE}`;

                    try {
                        const appManifestResponse = await fetch(appManifestUrl);

                        if (!appManifestResponse.ok) {
                            failedApps += 1;
                            continue;
                        }

                        const appManifestText = await appManifestResponse.text();
                        const appManifest = JSON5.parse(appManifestText);

                        await createAppCard(appManifest, repoDisplayUrl, repoFetchBaseUrl, appPath, appFiles);
                        foundApps += 1;
                    } catch (error) {
                        sys42.alert(error)
                        failedApps += 1;
                    }
                }
            } catch (error) {
                console.error(error)
                failedRepos += 1;
            }
        }

        statusEl.textContent = `Loaded ${foundApps} app(s) from ${repos.length} repo(s). Repo failures: ${failedRepos}. App failures: ${failedApps}.`;

        if (foundApps === 0) {
            sys42.render({
                tag: "fieldset",
                content: "No apps found"
            }, appsContainer)
        }
    } catch (error) {
        statusEl.textContent = `Error: ${error.message}`;
    }
}

async function settings() {
    let repoListEl;

    function createRow(defval) {
        return {
            tag: "div",
            style: "display: flex;",
            content: [
                {
                    tag: "input",
                    value: defval,
                    style: "flex-grow: 1;"
                },
                {
                    tag: "button",
                    content: {tag: "ui-picto", value: "trash"}
                }
            ],
            created: (el)=>{
                let btn = el.getElementsByTagName("button")[0]
                btn.addEventListener("click", (e)=>{
                    el.parentElement.removeChild(el)
                })
            }
        }
    }

    let rows = [];
    const extraRepos = await fs.readJSON("/c/programs/appstore/repos.json")
    extraRepos.forEach((repo)=>{
        rows.push(createRow(repo))
    })
    rows.push(createRow(""))


    const plan = {
        tag: "main",
        content: [
            {
                tag: "h4",
                content: "Repo lists"
            },
            "Here you can add custom repos",
            {tag: "br"},
            {
                tag: "span",
                style: "color: red",
                content: "Be careful, some repo's could contain malware."
            },
            {
                tag: "fieldset",
                content: [
                    {
                        tag: "div.rows",
                        content: rows,
                        created: (el)=>{repoListEl = el}
                    },
                    {
                        tag: "button",
                        content: {tag: "ui-picto", value: "plus"},
                        action: ()=>{
                            sys42.render(createRow(""), repoListEl)
                        }
                    }
                ]
            },
            {
                tag: "button",
                content: "Save",
                action: async () => {
                    let repos = []
                    for (let i=0; i<repoListEl.children.length; i++) {
                        let input = repoListEl.children[i].children[0]
                        if (input.value.trim() != "") {
                            repos.push(input.value)
                        }
                    }

                    await fs.writeJSON("/c/programs/appstore/repos.json", repos)
                    await sys42.alert("Saved!")
                }
            }
        ]
    }

    // TODO: picto and grow
    let dialog = await sys42.dialog(configure({label: "Repos", width: 350, height: 160, content: plan}))
    // console.log(dialog)
}

export async function renderApp(app) {
    // console.log(app)
    return {
        tag: "main",
        content: [
            {
                tag: ".cols",
                content: [
                    {
                        tag: "h2",
                        content: "Appstore"
                    },
                    {
                        tag: "button",
                        content: "Refresh",
                        action: ()=>{
                            statusEl.textContent = "loading..."
                            loadApps();
                        }
                    },
                    {
                        tag: "button",
                        content: {tag: "ui-picto", value: "cog"},
                        action: async ()=>{await settings()}
                    }
                ]
            },
            {
                tag: "span",
                content: "loading...",
                created: (el)=>{statusEl = el}
            },
            {
                tag: "div",
                created: (el)=>{appsContainer = el; loadApps();}
            }
        ]
    }
}