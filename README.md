Kommentar-Overlay und Seiten-Voting System

Dieses Projekt bietet eine einfache und flexible Möglichkeit, eine Kommentarfunktion mit Voting (für einzelne Kommentare und ganze Seiten) direkt auf beliebigen Webseiten zu integrieren. Benutzer können Kommentare verfassen, diese bewerten und so die Interaktion und Feedbackkultur auf der Webseite deutlich verbessern.
Funktionen im Überblick

    Kommentieren mit E-Mail-basierter Nutzer-Identifikation
    Sicherstellung der Nutzeridentität durch E-Mail-Verifizierung kombiniert mit serverseitigem Proof-of-Work (PoW) zur effektiven Spam-Abwehr.

    Up- und Downvoting
    Bewertung sowohl einzelner Kommentare als auch der gesamten Webseite möglich.

    Nachweis durch Zeitstempel und Hash-Wert
    Jeder Kommentar ist mit einem Zeitpunkt und einem kryptografischen Hash versehen, um Transparenz und Integrität zu gewährleisten.

    Resizables Overlay
    Flexibles, einblendbares Overlay mit Übersicht aller Kommentare sowie Eingabemöglichkeit.

    Benutzerfreundliche Oberfläche via Tampermonkey Userscript
    Leichte Installation und Nutzung direkt über ein Tampermonkey-Skript im Browser.

    Serverseitige API in PHP mit SQLite-Datenbank, später Update auf MySQL
    Effiziente und leichtgewichtige Backend-Implementierung für Speicherung und Verwaltung.

Technische Details

    Backend: PHP (API-Implementierung)

    Datenbank: SQLite (lokal, dateibasiert)

    Frontend: JavaScript (Tampermonkey Userscript für Overlay und Interaktion)

    Spam-Schutz: Proof-of-Work Mechanismus auf Server-Seite

Installation

    Installieren Sie Tampermonkey in Ihrem Browser.

    Fügen Sie das Tampermonkey-Skript über die zentrale URL hinzu, die das Overlay lädt und automatisch aktualisiert.

    Das Overlay erscheint auf der gewünschten Webseite und kann beliebig genutzt werden.

Quellcode & Weiterentwicklung

Der Quellcode dieses Projekts ist aktuell nicht öffentlich verfügbar, da sich das System noch in aktiver Entwicklung befindet. Bei Interesse an einer Zusammenarbeit, Feedback oder Fragen können Sie gerne Kontakt aufnehmen. Eine Veröffentlichung ist jedoch angedacht.

© 2025 Marco Schwald – Alle Rechte vorbehalten.
