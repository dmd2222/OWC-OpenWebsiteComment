// ==UserScript==
// @name         Kommentar-Overlay mit globalem Seiten-Voting + Debugging
// @namespace    http://your-namespace.example
// @version      1.7
// @description  Kommentieren & Voten (Seite + Kommentare) mit Server-PoW, resizable overlay, Debug-Tab
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      marcoschwald.de
// @updateURL    https://marcoschwald.de/Develop/website_comment/comment_overlay.user.js
// @downloadURL  https://marcoschwald.de/Develop/website_comment/comment_overlay.user.js
// ==/UserScript==

(function() {
    'use strict';

    const apiBase = "https://marcoschwald.de/Develop/website_comment/";
    const pageUrl = encodeURIComponent(location.href);
    const localKeyEmail = "comment_overlay_email";
    const localKeyPassword = "comment_overlay_password";


    // --- Debug UI Code hier (wie vorher) ---

    const debugLogs = [];
    function logDebug(...args) {
        debugLogs.push(args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : a)).join(' '));
        updateDebugUI();
    }
    function updateDebugUI() {
        if (!debugPanel) return;
        debugContent.textContent = debugLogs.slice(-50).join('\n\n');
        debugContent.scrollTop = debugContent.scrollHeight;
    }
    function createDebugPanel() {
        const panel = document.createElement('div');
        panel.id = 'debug-panel';
        panel.style.position = 'fixed';
        panel.style.bottom = '0';
        panel.style.right = '0';
        panel.style.width = '350px';
        panel.style.height = '200px';
        panel.style.backgroundColor = 'rgba(0,0,0,0.85)';
        panel.style.color = 'lightgreen';
        panel.style.fontFamily = 'monospace';
        panel.style.fontSize = '11px';
        panel.style.padding = '6px';
        panel.style.overflowY = 'auto';
        panel.style.zIndex = 100000;
        panel.style.borderTopLeftRadius = '8px';
        panel.style.boxShadow = '0 0 10px #000';
        panel.style.resize = 'vertical';
        panel.style.display = 'none';

        const header = document.createElement('div');
        header.textContent = 'Debug-Log (Klick zum Öffnen/Schließen)';
        header.style.cursor = 'pointer';
        header.style.padding = '2px 4px';
        header.style.backgroundColor = '#111';
        header.style.userSelect = 'none';
        header.style.borderRadius = '4px';
        header.style.marginBottom = '4px';

        header.addEventListener('click', () => {
            if (debugContent.style.display === 'none') {
                debugContent.style.display = 'block';
                panel.style.height = '200px';
            } else {
                debugContent.style.display = 'none';
                panel.style.height = '24px';
            }
        });

        const content = document.createElement('pre');
        content.id = 'debug-content';
        content.style.whiteSpace = 'pre-wrap';
        content.style.wordBreak = 'break-word';
        content.style.height = 'calc(100% - 24px)';
        content.style.margin = '0';
        content.style.padding = '0 4px';
        content.style.display = 'none';

        panel.appendChild(header);
        panel.appendChild(content);

        document.body.appendChild(panel);

        return { panel, content };
    }

    const { panel: debugPanel, content: debugContent } = createDebugPanel();

    async function getEmail() {
        let email = await GM_getValue(localKeyEmail, null);
        const isValidEmail = (e) => /\S+@\S+\.\S+/.test(e);

        while (!email || !isValidEmail(email)) {
            email = prompt("Bitte gib deine gültige E-Mail-Adresse ein für Kommentare und Voting:");
            if (email === null) break;  // Abbrechen

            if (isValidEmail(email)) {
                await GM_setValue(localKeyEmail, email);
            } else {
                alert('Bitte gib eine gültige E-Mail-Adresse ein.');
                email = null; // damit loop weiter läuft
            }
        }
        return email;
    }


    function sha256(str) {
        const utf8 = new TextEncoder().encode(str);
        return crypto.subtle.digest("SHA-256", utf8).then(buf => {
            return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        });
    }

    async function generatePoW(challenge, difficulty) {
        return new Promise((resolve) => {
            let nonce = 0;
            const prefix = "0".repeat(difficulty);

            function tryNext() {
                const input = challenge + nonce;
                sha256(input).then(hash => {
                    if (hash.startsWith(prefix)) {
                        resolve({ powNonce: nonce, powHash: hash });
                    } else {
                        nonce++;
                        if (nonce % 1000 === 0) {
                            setTimeout(tryNext, 0);
                        } else {
                            tryNext();
                        }
                    }
                });
            }
            tryNext();
        });
    }

    function apiRequest(method, endpoint, data, onload) {
        logDebug(`API-Request: ${method} ${endpoint}`, data);
        GM_xmlhttpRequest({
            method: method,
            url: apiBase + endpoint,
            headers: { "Content-Type": "application/json" },
            data: data ? JSON.stringify(data) : null,
            onload: (res) => {
                logDebug(`API-Response: ${method} ${endpoint}`, res.status, res.responseText);
                onload(res);
            },
            onerror: (err) => {
                logDebug(`API-Error: ${method} ${endpoint}`, err);
            }
        });
    }

    function createOverlay() {
        const style = document.createElement('style');
        style.textContent = `
            #comment-overlay {
                position: relative;
                top: 0;
                left: 0;
                right: 0;
                max-height: 400px;
                min-height: 120px;
                background: rgba(0,0,0,0.85);
                color: white;
                font-family: Arial, sans-serif;
                font-size: 14px;
                padding: 8px 10px;
                box-sizing: border-box;
                z-index: 99999;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 6px;
                resize: vertical;
            }
            .comment-meta {
                font-size: 10px;
                color: #aaa;
                margin-left: 6px;
            }

            #comment-overlay > .top-row {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            #global-votes {
                display: flex;
                align-items: center;
                gap: 10px;
                font-weight: bold;
                user-select: none;
                white-space: nowrap;
            }
            #global-votes button {
                background: #444;
                border: none;
                color: white;
                padding: 4px 8px;
                cursor: pointer;
                border-radius: 4px;
                font-size: 16px;
                display: flex;
                align-items: center;
                gap: 4px;
                transition: background-color 0.3s ease;
            }
            #global-votes button.active {
                background-color: #0a0;
            }
            #global-votes button.downvote.active {
                background-color: #a00;
            }
            #comment-overlay button {
                background: #444;
                border: none;
                color: white;
                padding: 6px 10px;
                cursor: pointer;
                border-radius: 4px;
                font-size: 14px;
                flex-shrink: 0;
                transition: background-color 0.3s ease;
            }
            #comment-overlay button:hover {
                background: #666;
            }
            #comment-input {
                flex-grow: 1;
                padding: 6px 10px;
                font-size: 14px;
                border-radius: 4px;
                border: none;
                outline: none;
                min-width: 150px;
            }
            #score-display {
                font-weight: bold;
                user-select: none;
                white-space: nowrap;
                flex-shrink: 0;
            }
            #comment-list {
                flex-grow: 1;
                overflow-y: auto;
                white-space: normal;
                font-size: 13px;
                border-top: 1px solid #555;
                padding-top: 4px;
                max-height: 150px;
            }
            #comment-list > div {
                padding: 2px 0;
                border-bottom: 1px solid #333;
            }
            #settings-panel {
                position: absolute;
                top: 30px;
                right: 10px;
                background-color: rgba(0,0,0,0.9);
                color: white;
                padding: 10px;
                border-radius: 6px;
                box-shadow: 0 0 10px black;
                z-index: 100000;
                display: none;
                width: 250px;
                font-size: 14px;
                user-select: none;
            }
            #settings-panel input {
                background-color: #222;
                border: 1px solid #555;
                color: white;
                padding: 6px 8px;
                border-radius: 4px;
            }
            #settings-panel button {
                background-color: #444;
                border: none;
                color: white;
                padding: 8px;
                width: 100%;
                border-radius: 4px;
                cursor: pointer;
                font-weight: bold;
                margin-top: 6px;
            }
            #settings-panel button:hover {
                background-color: #666;
            }
        `;
        document.head.appendChild(style);

        const container = document.createElement('div');
        container.id = 'comment-overlay';
        container.style.position = 'relative';

        // Globale Votes (Seite)
        const globalVotes = document.createElement('div');
        globalVotes.id = 'global-votes';

        const btnGlobalUp = document.createElement('button');
        btnGlobalUp.id = 'btnGlobalUp';
        btnGlobalUp.title = 'Daumen hoch für diese Seite';
        btnGlobalUp.textContent = '👍';

        const globalUpCount = document.createElement('span');
        globalUpCount.id = 'globalUpCount';
        globalUpCount.textContent = '0';

        const btnGlobalDown = document.createElement('button');
        btnGlobalDown.id = 'btnGlobalDown';
        btnGlobalDown.title = 'Daumen runter für diese Seite';
        btnGlobalDown.textContent = '👎';

        const globalDownCount = document.createElement('span');
        globalDownCount.id = 'globalDownCount';
        globalDownCount.textContent = '0';

        globalVotes.appendChild(btnGlobalUp);
        globalVotes.appendChild(globalUpCount);
        globalVotes.appendChild(btnGlobalDown);
        globalVotes.appendChild(globalDownCount);

        // Kommentar Eingabe und Buttons
        const topRow = document.createElement('div');
        topRow.className = 'top-row';

        // Zahnrad-Button rechts oben
        const settingsBtn = document.createElement('button');
        settingsBtn.id = 'btnSettings';
        settingsBtn.title = 'Einstellungen';
        settingsBtn.textContent = '⚙️';
        settingsBtn.style.marginLeft = 'auto';
        settingsBtn.style.fontSize = '18px';
        settingsBtn.style.background = 'transparent';
        settingsBtn.style.border = 'none';
        settingsBtn.style.color = 'white';
        settingsBtn.style.cursor = 'pointer';
        settingsBtn.style.flexShrink = '0';

        topRow.appendChild(settingsBtn);

        const input = document.createElement('input');
        input.id = 'comment-input';
        input.type = 'text';
        input.placeholder = 'Kommentar schreiben...';

        const btnSend = document.createElement('button');
        btnSend.textContent = 'Senden';

        // Score (Kommentare gesamt)
        const scoreDisplay = document.createElement('div');
        scoreDisplay.id = 'score-display';
        scoreDisplay.textContent = '👍 0';

        topRow.appendChild(scoreDisplay);
        topRow.appendChild(input);
        topRow.appendChild(btnSend);

        // Kommentar Liste
        const commentList = document.createElement('div');
        commentList.id = 'comment-list';
        commentList.textContent = 'Lade Kommentare...';

        // Settings Panel erstellen und anhängen
        const settingsPanel = createSettingsPanel();
        container.appendChild(settingsPanel);

        container.appendChild(globalVotes);
        container.appendChild(topRow);
        container.appendChild(commentList);

        document.body.prepend(container);

        return {
            container,
            globalVotes,
            btnGlobalUp,
            btnGlobalDown,
            globalUpCount,
            globalDownCount,
            scoreDisplay,
            input,
            btnSend,
            commentList,
            settingsBtn,
            settingsPanel
        };
    }

    // Funktion: Einstellungs-Panel erstellen
    function createSettingsPanel() {
        const panel = document.createElement('div');
        panel.id = 'settings-panel';

        panel.innerHTML = `
            <label for="emailInput">E-Mail:</label><br>
            <input type="email" id="emailInput" style="width: 100%; margin-bottom: 8px;" placeholder="E-Mail eingeben"><br>
            <label for="passwordInput">Passwort:</label><br>
            <input type="password" id="passwordInput" style="width: 100%; margin-bottom: 8px;" placeholder="Passwort eingeben"><br>
            <button id="saveSettingsBtn">Speichern</button>
        `;

        return panel;
    }

    async function hashPassword(password) {
        return await sha256(password);
    }

    async function main() {
        const email = await getEmail();
        let password = await GM_getValue(localKeyPassword, null);
        if (!password) {
            // Noch kein Passwort gespeichert, Registrierung starten
            await doRegister(email);
            password = await GM_getValue(localKeyPassword, null);
            if (!password) {
                alert('Registrierung nicht abgeschlossen, kein Passwort gefunden.');
                return;
            }
        }

        if (!email) {
            alert('Ohne gültige E-Mail kannst du keine Kommentare posten oder voten.');
            return;
        }

        const {
            container,
            globalVotes,
            btnGlobalUp,
            btnGlobalDown,
            globalUpCount,
            globalDownCount,
            scoreDisplay,
            input,
            btnSend,
            commentList,
            settingsBtn,
            settingsPanel
        } = createOverlay();

        // Einstellungen-Panel ein-/ausblenden beim Klick auf Zahnrad
        settingsBtn.addEventListener('click', async () => {
            if (settingsPanel.style.display === 'block') {
                settingsPanel.style.display = 'none';
            } else {
                settingsPanel.style.display = 'block';

                // Vorbefüllen mit gespeicherten Werten
                const savedEmail = await GM_getValue(localKeyEmail, '');
                const savedPassword = await GM_getValue(localKeyPassword, '');

                settingsPanel.querySelector('#emailInput').value = savedEmail || '';
                settingsPanel.querySelector('#passwordInput').value = savedPassword || '';
            }
        });

        // Speichern-Button im Einstellungs-Panel
        settingsPanel.querySelector('#saveSettingsBtn').addEventListener('click', async () => {
            const newEmail = settingsPanel.querySelector('#emailInput').value.trim();
            const newPassword = settingsPanel.querySelector('#passwordInput').value.trim();

            const isValidEmail = e => /\S+@\S+\.\S+/.test(e);
            if (!isValidEmail(newEmail)) {
                alert('Bitte eine gültige E-Mail-Adresse eingeben.');
                return;
            }
            if (!newPassword) {
                alert('Bitte ein Passwort eingeben.');
                return;
            }

            await GM_setValue(localKeyEmail, newEmail);
            await GM_setValue(localKeyPassword, newPassword);

            alert('Einstellungen gespeichert. Bitte lade die Seite neu, damit sie wirksam werden.');
            settingsPanel.style.display = 'none';
        });

        async function refreshComments() {
            apiRequest('GET', `fetch?page=${pageUrl}&email=${encodeURIComponent(email)}`, null, (res) => {
                if (res.status !== 200) {
                    commentList.textContent = 'Fehler beim Laden der Kommentare';
                    return;
                }
                try {
                    const data = JSON.parse(res.responseText);

                    // Kommentare Anzahl + Score (Kommentar-Summe)
                    scoreDisplay.textContent = `Kommentare: ${data.comments.length} | Gesamt 👍: ${data.score || 0}`;

                    // Globale Votes Seite (sum up/down und eigene Wertung)
                    const pageScore = data.pageScore || 0;
                    const myPageVote = data.myPageVote || 0;

                    globalUpCount.textContent = pageScore > 0 ? pageScore : 0;
                    globalDownCount.textContent = pageScore < 0 ? -pageScore : 0;

                    btnGlobalUp.classList.toggle('active', myPageVote === 1);
                    btnGlobalDown.classList.toggle('active', myPageVote === -1);

                    // Kommentare anzeigen
                    commentList.innerHTML = '';
                    if (data.comments.length === 0) {
                        commentList.textContent = 'Keine Kommentare';
                    } else {
                        for (const c of data.comments) {
                            const div = document.createElement('div');

                            const commentText = document.createElement('span');
                            commentText.textContent = `• ${c.comment}`;

                            const meta = document.createElement('span');
                            meta.className = 'comment-meta';
                            const date = new Date(c.created_at).toLocaleString();
                            meta.textContent = ` (${date} • ${c.hash.slice(0, 8)}…)`;

                            div.appendChild(commentText);
                            div.appendChild(meta);
                            commentList.appendChild(div);
                        }
                    }
                } catch {
                    commentList.textContent = 'Fehler beim Laden der Kommentare';
                }
            });
        }

        async function doRegister(email) {
            try {
                const challengeData = await getPoWChallenge(email);
                const { powNonce } = await generatePoW(challengeData.challenge, challengeData.difficulty);

                apiRequest('POST', 'register', {
                    email,
                    powNonce,
                    powChallenge: challengeData.challenge,
                    powDifficulty: challengeData.difficulty
                }, async (res) => {
                    if (res.status === 200) {
                        const data = JSON.parse(res.responseText);
                        if (data.passwordHash) {
                            await GM_setValue(localKeyPassword, data.passwordHash);
                            alert('Registrierung erfolgreich, Passwort gespeichert.');
                        } else {
                            alert('Registrierung fehlgeschlagen: Passwort nicht erhalten.');
                        }
                    } else {
                        alert('Registrierung fehlgeschlagen, Server antwortete mit ' + res.status);
                    }
                });
            } catch (e) {
                alert('Registrierung fehlgeschlagen: ' + e.message);
            }
        }

        async function getPoWChallenge(email) {
            return new Promise((resolve, reject) => {
                apiRequest('GET', `pow_challenge?email=${encodeURIComponent(email)}`, null, (res) => {
                    if (res.status !== 200) {
                        reject(new Error('Fehler beim PoW Challenge Abruf'));
                        return;
                    }
                    try {
                        const data = JSON.parse(res.responseText);
                        resolve(data);
                    } catch {
                        reject(new Error('Ungültige Antwort beim PoW Challenge Abruf'));
                    }
                });
            });
        }

        btnGlobalUp.addEventListener('click', async () => {
            await sendVote(1);
        });

        btnGlobalDown.addEventListener('click', async () => {
            await sendVote(-1);
        });

        async function sendVote(vote) {
            const challengeData = await getPoWChallenge(email);
            const { powNonce } = await generatePoW(challengeData.challenge, challengeData.difficulty);

            const pass = await GM_getValue(localKeyPassword);

            const body = {
                email,
                passwordHash: pass,
                vote,
                powNonce,
                powChallenge: challengeData.challenge,
                powDifficulty: challengeData.difficulty,
                pageUrl
            };
            apiRequest('POST', 'vote', body, (res) => {
                if (res.status === 200) {
                    refreshComments();
                } else {
                    alert('Fehler beim Abstimmen');
                }
            });
        }

        btnSend.addEventListener('click', async () => {
            const comment = input.value.trim();
            if (!comment) return;

            const challengeData = await getPoWChallenge(email);
            const { powNonce } = await generatePoW(challengeData.challenge, challengeData.difficulty);

            const pass = await GM_getValue(localKeyPassword);

            const body = {
                email,
                passwordHash: pass,
                comment,
                powNonce,
                powChallenge: challengeData.challenge,
                powDifficulty: challengeData.difficulty,
                pageUrl
            };

            apiRequest('POST', 'comment', body, (res) => {
                if (res.status === 200) {
                    input.value = '';
                    refreshComments();
                } else {
                    alert('Fehler beim Senden des Kommentars');
                }
            });
        });

        refreshComments();
    }

    main();

})();
