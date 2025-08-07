// ==UserScript==
// @name         Kommentar-Overlay mit globalem Seiten-Voting + Debugging
// @namespace    http://your-namespace.example
// @version      1.6
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
    let email = await GM_getValue('comment_overlay_email', null);
    const isValidEmail = (e) => /\S+@\S+\.\S+/.test(e);

    while (!email || !isValidEmail(email)) {
        email = prompt("Bitte gib deine gültige E-Mail-Adresse ein für Kommentare und Voting:");
        if (email === null) break;  // Abbrechen

        if (isValidEmail(email)) {
            await GM_setValue('comment_overlay_email', email);
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
        `;
        document.head.appendChild(style);

        const container = document.createElement('div');
        container.id = 'comment-overlay';

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

        // Daumen für Kommentar Up/Down (aktuell vereinfacht: global für Seite, für einzelne Kommentare kannst du noch erweitern)
        // Hier aus Vereinfachung nur globale Votes und Kommentarliste.

        topRow.appendChild(scoreDisplay);
        topRow.appendChild(input);
        topRow.appendChild(btnSend);

        // Kommentar Liste
        const commentList = document.createElement('div');
        commentList.id = 'comment-list';
        commentList.textContent = 'Lade Kommentare...';

        container.appendChild(globalVotes);
        container.appendChild(topRow);
        container.appendChild(commentList);

       // document.body.style.marginTop = '120px';
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
            commentList
        };
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
            commentList
        } = createOverlay();

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

                    // globalUpCount / globalDownCount anhand pageScore (sehr einfache Zählung)
                    // Wir brauchen Up und Down separat:
                    // Annahme: pageScore = Up - Down
                    // Aber wir haben nur Summe in DB, keine getrennten Werte.
                    // Daher: Wir brauchen eine neue API oder Anpassung, um Up/Down getrennt zu liefern.
                    // Zur schnellen Umsetzung: Wir zeigen pageScore als Differenz und eigene Wertung als Farbe.

                    // Wenn pageScore positiv, alle als Up-Count, sonst 0
                    globalUpCount.textContent = pageScore > 0 ? pageScore : 0;
                    globalDownCount.textContent = pageScore < 0 ? -pageScore : 0;

                    // Button-Styles für eigene Wertung
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
    const date = new Date(c.created_at).toLocaleString(); // formatiertes Datum
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
                        try {
                            const data = JSON.parse(res.responseText);
                            if (data.status === "already_confirmed") {
                                console.log("User ist bereits bestätigt, keine Registrierung nötig.");
                            } else if (data.status === "confirmation_sent") {
                                alert('Registrierung abgeschlossen. Bitte bestätige deine E-Mail und lade die Seite neu.\n' + JSON.stringify(data, null, 2));

                                if (data.your_secret_password) {
                                    await GM_setValue(localKeyPassword, data.your_secret_password);
                                    console.log('Passwort gespeichert');
                                } else {
                                    alert('Kein Passwort vom Server erhalten');
                                }
                            } else if (data.status === "confirmation_resent") {
                                alert('Bestätigungsmail wurde erneut gesendet.');
                            } else {
                                alert('Unbekannte Serverantwort: ' + res.responseText);
                            }
                        } catch(e) {
                            alert('Fehler beim Verarbeiten der Serverantwort.');
                        }
                    } else {
                        alert('Registrierung fehlgeschlagen.');
                    }
                });
            } catch (e) {
                alert('Fehler beim PoW oder Registrierung: ' + e.message);
            }
        }

        async function postComment(email,comment) {
            try {

                const passwordPlain = await GM_getValue(localKeyPassword, null);
                const password = await sha256(passwordPlain);


                const challengeData = await getPoWChallenge(email);
                const { powNonce } = await generatePoW(challengeData.challenge, challengeData.difficulty);

                apiRequest('POST', 'comment', {
                    email,
                    hashed_password: password,
                    page: decodeURIComponent(pageUrl),
                    comment,
                    powNonce,
                    powChallenge: challengeData.challenge,
                    powDifficulty: challengeData.difficulty
                }, (res) => {
                    if (res.status === 200) {
                        input.value = '';
                        refreshComments();
                    } else {
                            alert('Kommentar konnte nicht gesendet werden. Server-Antwort: ' + res.status + ' ' + res.responseText);
                    }
                });
            } catch (e) {
                alert('Fehler beim PoW oder Kommentar senden: ' + e.message);
            }
        }

        async function sendPageVote(email,vote) {
            try {
                const passwordPlain = await GM_getValue(localKeyPassword, null);
                const password = await sha256(passwordPlain);

                const challengeData = await getPoWChallenge(email);
                const { powNonce } = await generatePoW(challengeData.challenge, challengeData.difficulty);

                apiRequest('POST', 'page_vote', {
                    email,
                    hashed_password: password,
                    page: decodeURIComponent(pageUrl),
                    vote,
                    powNonce,
                    powChallenge: challengeData.challenge,
                    powDifficulty: challengeData.difficulty
                }, (res) => {
                    if (res.status === 200) {
                        refreshComments();
                    } else {
                        alert('Seiten-Vote fehlgeschlagen.');
                    }
                });
            } catch (e) {
                alert('Fehler beim PoW oder Seiten-Vote senden: ' + e.message);
            }
        }

        doRegister(email);

btnSend.addEventListener('click', () => {
    const commentText = input.value.trim();
    if (!commentText) return alert('Kommentar darf nicht leer sein.');
    postComment(email,commentText);
});

btnGlobalUp.addEventListener('click', () => sendPageVote(email,1));
btnGlobalDown.addEventListener('click', () => sendPageVote(email,-1));


        refreshComments();
    }

async function getPoWChallenge(email) {
    return new Promise((resolve, reject) => {
        apiRequest('POST', 'powchallenge', { email }, (res) => {
            if (res.status === 200) {
                try {
                    const data = JSON.parse(res.responseText);
                    resolve(data);
                } catch (e) {
                    reject(e);
                }
            } else {
                reject(new Error('Failed to get PoW challenge (' + res.status + ')'));
            }
        });
    });
}


    main().catch(console.error);

})();
