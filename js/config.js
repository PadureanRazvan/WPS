// === TRANSLATIONS ===
export const translations = {
    ro: {
        // Dashboard
        'dashboard-title': 'Dashboard',
        'total-active-agents': 'Total Agenți Activi',
        'agents-in-db': 'Agenți în baza de date*',
        'planned-hours': 'Ore Planificate',
        'agents-planned': 'agenți planificați',
        'average-productivity': 'Productivitate Medie',
        'today': 'Azi',
        'tomorrow': 'Mâine',
        'hours-by-team': 'Ore Alocate pe Echipe',
        'hours-by-team-today': 'Ore Alocate pe Echipe - Azi',
        'hours-by-team-tomorrow': 'Ore Alocate pe Echipe - Mâine',
        'shop': 'Shop',
        'agents': 'Agenți',
        'total-hours': 'Total Ore',
        'productivity-trend': 'Trend Productivitate',

        // Users
        'users-title': 'Gestionare Utilizatori',
        'add-new-user': 'Adaugă Utilizator Nou',
        'full-name': 'Nume Complet',
        'username': 'Nume Utilizator',
        'contract-hours': 'Ore Contract',
        'contract-type': 'Tip Contract',
        'primary-team': 'Echipa Principală',
        'hire-date': 'Data Angajării',
        'active': 'Activ',
        'actions': 'Acțiuni',
        'delete': 'Șterge',

        // Planner
        'planner-title': 'Planificator',
        'search-agent-placeholder': 'Caută agent...',
        'select-agents': 'Selectare Inteligentă',

        // Productivity
        'productivity-title': 'Productivitate',
        'prod-agents-processed': 'Agenți Procesați',
        'prod-tickets-resolved': 'Tickete Rezolvate',
        'prod-calls-answered': 'Apeluri Răspunse',
        'prod-average': 'Productivitate Medie',
        'prod-from-xlsx': 'din fișiere XLSX',
        'prod-from-csv': 'din fișiere CSV',
        'prod-formula': '(tickete+apeluri) / ore',
        'prod-days': 'zile',
        'prod-day': 'zi',
        'prod-with-data': 'cu date',
        'prod-no-agents': 'Niciun agent găsit. Verifică dacă perioada selectată conține date încărcate și dacă agenții sunt înregistrați.',
        'prod-upload-to-see': 'Încarcă fișierele din secțiunea Upload pentru a vedea datele.',
        'prod-select-agent': 'Selectează cel puțin un agent din lista de mai sus.',
        'prod-no-results': 'Niciun rezultat pentru selecția curentă.',
        'prod-all-teams': 'Toate',
        'prod-summary': 'Sumar',
        'prod-per-agent': 'Per Agent',
        'prod-all-btn': 'Toți',
        'prod-none-btn': 'Niciunul',
        'prod-selected': 'selectați',
        'prod-agents-from-tickets': 'agenți din tickete',
        'prod-agents-from-calls': 'agenți din apeluri',
        'prod-agents-tickets': 'agenți tickete',
        'prod-agents-calls': 'agenți apeluri',
        'prod-no-data-tooltip': 'fără date',
        'prod-data-uploaded-for': 'Date încărcate pentru',
        'prod-can-add-file': 'Poți adăuga și celălalt fișier sau schimba data.',
        'prod-date-selected': 'Data selectată:',
        'prod-can-upload': 'poți încărca fișierele.',
        'prod-data-exists': 'există deja. Încărcarea de fișiere noi va suprascrie datele existente pentru această zi.',
        'prod-data-for': 'Datele pentru',
        'prod-select-period': 'Selectează perioada...',
        'prod-search-agent': 'Caută agent...',
        'prod-save-error': 'Eroare la salvarea datelor în baza de date.',
        'prod-delete-btn': 'Șterge datele pentru această zi',
        'prod-deleted': 'Datele pentru {date} au fost șterse.',
        'prod-select-date-first': 'Selectează mai întâi data fișierelor!',
        'prod-agents-selected': 'Agenți Selectați',
        'prod-total-tickets': 'Total Tickete',
        'prod-total-calls': 'Total Apeluri',
        'prod-days-with-data': 'zile cu date',

        // Table headers
        'th-agent': 'Agent',
        'th-teams': 'Echipe',
        'th-tickets': 'Tickete',
        'th-calls': 'Apeluri',
        'th-total': 'Total',
        'th-hours-worked': 'Ore Lucrate',
        'th-productivity': 'Productivitate',
        'th-date': 'Data',
        'th-schedule': 'Program',
        'th-hours': 'Ore',

        // Planner
        'planner-agent': 'Agent',
        'planner-hours': 'Ore',
        'planner-total': 'Total',
        'planner-week-total': 'Total Săpt.',
        'planner-day-names': 'DUM,LUN,MAR,MIE,JOI,VIN,SÂM',
        'planner-search-team': 'Caută echipă...',
        'planner-search-agent': 'Caută agent...',
        'planner-select-months': 'Selectați una sau mai multe luni pentru a le vizualiza.',
        'planner-invalid-range': 'Perioadă invalidă.',

        // Reports
        'reports-hours-per-shop': 'Ore Planificate per Shop',
        'reports-distribution': 'Distribuție Agenți per Shop',
        'reports-shop': 'Shop',
        'reports-total-hours': 'Total Ore',
        'reports-nr-agents': 'Nr. Agenți',
        'reports-agents-hours': 'agenți',
        'reports-hours-unit': 'ore',
        'reports-select-range': 'Selectează un interval de date pentru a genera rapoartele.',
        'reports-no-data': 'Nu există date planificate pentru intervalul selectat.',

        // Charts
        'charts-no-data': 'Nu există date de productivitate încărcate. Încarcă fișiere din secțiunea Upload.',
        'charts-hours-unit': 'ore',

        // Edit Modal
        'edit-title': 'Editează Selecția',
        'edit-current-selection': 'Selecție Curentă',
        'edit-type-title': 'Tipul de Editare',
        'edit-working-hours': 'Ore de Lucru',
        'edit-working-desc': 'Modifică alocarea orelor pe echipe (ex: 6 IT + 2 HU)',
        'edit-holiday': 'Concediu (CO)',
        'edit-holiday-desc': 'Marchează zilele ca fiind concediu',
        'edit-sick': 'Concediu Medical (CM)',
        'edit-sick-desc': 'Marchează zilele ca fiind concediu medical',
        'edit-dayoff': 'Zi Liberă (LB)',
        'edit-dayoff-desc': 'Marchează ca zi liberă cu justificare obligatorie',
        'edit-config-hours': 'Configurare Ore de Lucru',
        'edit-total': 'Total:',
        'edit-hours-unit': 'ore',
        'edit-over-limit': 'Depășește limita de 12 ore',
        'edit-dayoff-reason': 'Justificare pentru Zi Liberă',
        'edit-dayoff-placeholder': 'Introdu motivul pentru ziua liberă (obligatoriu)...',
        'edit-cancel': 'Anulează',
        'edit-save': 'Salvează Modificările',
        'edit-select-cells': 'Selectează cel puțin o celulă pentru editare.',
        'edit-select-type': 'Selectează un tip de modificare.',
        'edit-over-12': 'Totalul orelor nu poate depăși 12 ore pe zi.',
        'edit-selection': 'Selecție:',
        'edit-cells-selected': 'celule selectate',
        'edit-total-hours': 'Total ore:',

        // Upload
        'upload-title': 'Încărcare Fișiere',
        'select-date': '1. Selectează data fișierelor',
        'date-question': 'Pentru ce zi sunt datele de productivitate?',
        'tickets-xlsx': '2. Tickete (XLSX)',
        'calls-csv': '3. Apeluri (CSV)',
        'drag-xlsx': 'Trage fișierul Excel aici sau click pentru selectare',
        'drag-csv': 'Trage fișierul CSV aici sau click pentru selectare',
        'uploaded-data': 'Date Încărcate',

        // Reports
        'reports-title': 'Rapoarte',

        // Info
        'info-title': 'Informații',

        // Login
        'login-button': 'Conectează-te cu Google',
        'logout': 'Deconectare',

        // Language names
        'language-romanian': 'Română',
        'language-english': 'English',
        'language-italian': 'Italiano',

        // Nav items
        'nav-dashboard': 'Dashboard',
        'nav-users': 'Utilizatori',
        'nav-planner': 'Planificator',
        'nav-productivity': 'Productivitate',
        'nav-upload': 'Încărcare Fișiere',
        'nav-reports': 'Rapoarte',
        'nav-info': 'Informații',
    },
    en: {
        // Dashboard
        'dashboard-title': 'Dashboard',
        'total-active-agents': 'Total Active Agents',
        'agents-in-db': 'Agents in database*',
        'planned-hours': 'Planned Hours',
        'agents-planned': 'agents planned',
        'average-productivity': 'Average Productivity',
        'today': 'Today',
        'tomorrow': 'Tomorrow',
        'hours-by-team': 'Hours Allocated by Team',
        'hours-by-team-today': 'Hours Allocated by Team - Today',
        'hours-by-team-tomorrow': 'Hours Allocated by Team - Tomorrow',
        'shop': 'Shop',
        'agents': 'Agents',
        'total-hours': 'Total Hours',
        'productivity-trend': 'Productivity Trend',

        // Users
        'users-title': 'User Management',
        'add-new-user': 'Add New User',
        'full-name': 'Full Name',
        'username': 'Username',
        'contract-hours': 'Contract Hours',
        'contract-type': 'Contract Type',
        'primary-team': 'Primary Team',
        'hire-date': 'Hire Date',
        'active': 'Active',
        'actions': 'Actions',
        'delete': 'Delete',

        // Planner
        'planner-title': 'Planner',
        'search-agent-placeholder': 'Search agent...',
        'select-agents': 'Smart Select',

        // Productivity
        'productivity-title': 'Productivity',
        'prod-agents-processed': 'Agents Processed',
        'prod-tickets-resolved': 'Tickets Resolved',
        'prod-calls-answered': 'Calls Answered',
        'prod-average': 'Average Productivity',
        'prod-from-xlsx': 'from XLSX files',
        'prod-from-csv': 'from CSV files',
        'prod-formula': '(tickets+calls) / hours',
        'prod-days': 'days',
        'prod-day': 'day',
        'prod-with-data': 'with data',
        'prod-no-agents': 'No agent found. Check if the selected period contains uploaded data and if agents are registered.',
        'prod-upload-to-see': 'Upload files from the Upload section to see the data.',
        'prod-select-agent': 'Select at least one agent from the list above.',
        'prod-no-results': 'No results for the current selection.',
        'prod-all-teams': 'All',
        'prod-summary': 'Summary',
        'prod-per-agent': 'Per Agent',
        'prod-all-btn': 'All',
        'prod-none-btn': 'None',
        'prod-selected': 'selected',
        'prod-agents-from-tickets': 'agents from tickets',
        'prod-agents-from-calls': 'agents from calls',
        'prod-agents-tickets': 'agents tickets',
        'prod-agents-calls': 'agents calls',
        'prod-no-data-tooltip': 'no data',
        'prod-data-uploaded-for': 'Data uploaded for',
        'prod-can-add-file': 'You can add another file or change the date.',
        'prod-date-selected': 'Selected date:',
        'prod-can-upload': 'you can upload the files.',
        'prod-data-exists': 'already exists. Uploading new files will overwrite the existing data for this day.',
        'prod-data-for': 'Data for',
        'prod-select-period': 'Select period...',
        'prod-search-agent': 'Search agent...',
        'prod-save-error': 'Error saving data to database.',
        'prod-delete-btn': 'Delete data for this day',
        'prod-deleted': 'Data for {date} has been deleted.',
        'prod-select-date-first': 'Select the file date first!',
        'prod-agents-selected': 'Agents Selected',
        'prod-total-tickets': 'Total Tickets',
        'prod-total-calls': 'Total Calls',
        'prod-days-with-data': 'days with data',

        // Table headers
        'th-agent': 'Agent',
        'th-teams': 'Teams',
        'th-tickets': 'Tickets',
        'th-calls': 'Calls',
        'th-total': 'Total',
        'th-hours-worked': 'Hours Worked',
        'th-productivity': 'Productivity',
        'th-date': 'Date',
        'th-schedule': 'Schedule',
        'th-hours': 'Hours',

        // Planner
        'planner-agent': 'Agent',
        'planner-hours': 'Hours',
        'planner-total': 'Total',
        'planner-week-total': 'Week Total',
        'planner-day-names': 'SUN,MON,TUE,WED,THU,FRI,SAT',
        'planner-search-team': 'Search team...',
        'planner-search-agent': 'Search agent...',
        'planner-select-months': 'Select one or more months to view.',
        'planner-invalid-range': 'Invalid period.',

        // Reports
        'reports-hours-per-shop': 'Planned Hours per Shop',
        'reports-distribution': 'Agent Distribution per Shop',
        'reports-shop': 'Shop',
        'reports-total-hours': 'Total Hours',
        'reports-nr-agents': 'Nr. Agents',
        'reports-agents-hours': 'agents',
        'reports-hours-unit': 'hours',
        'reports-select-range': 'Select a date range to generate reports.',
        'reports-no-data': 'No planned data for the selected range.',

        // Charts
        'charts-no-data': 'No productivity data uploaded. Upload files from the Upload section.',
        'charts-hours-unit': 'hours',

        // Edit Modal
        'edit-title': 'Edit Selection',
        'edit-current-selection': 'Current Selection',
        'edit-type-title': 'Edit Type',
        'edit-working-hours': 'Working Hours',
        'edit-working-desc': 'Modify team hour allocation (e.g., 6 IT + 2 HU)',
        'edit-holiday': 'Holiday (CO)',
        'edit-holiday-desc': 'Mark days as holiday',
        'edit-sick': 'Sick Leave (CM)',
        'edit-sick-desc': 'Mark days as sick leave',
        'edit-dayoff': 'Day Off (LB)',
        'edit-dayoff-desc': 'Mark as day off with mandatory justification',
        'edit-config-hours': 'Configure Working Hours',
        'edit-total': 'Total:',
        'edit-hours-unit': 'hours',
        'edit-over-limit': 'Exceeds 12 hour limit',
        'edit-dayoff-reason': 'Day Off Justification',
        'edit-dayoff-placeholder': 'Enter the reason for the day off (mandatory)...',
        'edit-cancel': 'Cancel',
        'edit-save': 'Save Changes',
        'edit-select-cells': 'Select at least one cell to edit.',
        'edit-select-type': 'Select an edit type.',
        'edit-over-12': 'Total hours cannot exceed 12 hours per day.',
        'edit-selection': 'Selection:',
        'edit-cells-selected': 'cells selected',
        'edit-total-hours': 'Total hours:',

        // Upload
        'upload-title': 'Upload Files',
        'select-date': '1. Select file date',
        'date-question': 'For which day is the productivity data?',
        'tickets-xlsx': '2. Tickets (XLSX)',
        'calls-csv': '3. Calls (CSV)',
        'drag-xlsx': 'Drag Excel file here or click to select',
        'drag-csv': 'Drag CSV file here or click to select',
        'uploaded-data': 'Uploaded Data',

        // Reports
        'reports-title': 'Reports',

        // Info
        'info-title': 'Information',

        // Login
        'login-button': 'Sign in with Google',
        'logout': 'Sign Out',

        // Language names
        'language-romanian': 'Romanian',
        'language-english': 'English',
        'language-italian': 'Italian',

        // Nav items
        'nav-dashboard': 'Dashboard',
        'nav-users': 'Users',
        'nav-planner': 'Planner',
        'nav-productivity': 'Productivity',
        'nav-upload': 'Upload File',
        'nav-reports': 'Reports',
        'nav-info': 'Info',
    },
    it: {
        // Dashboard
        'dashboard-title': 'Dashboard',
        'total-active-agents': 'Agenti Attivi Totali',
        'agents-in-db': 'Agenti nel database*',
        'planned-hours': 'Ore Pianificate',
        'agents-planned': 'agenti pianificati',
        'average-productivity': 'Produttività Media',
        'today': 'Oggi',
        'tomorrow': 'Domani',
        'hours-by-team': 'Ore Assegnate per Team',
        'hours-by-team-today': 'Ore Assegnate per Team - Oggi',
        'hours-by-team-tomorrow': 'Ore Assegnate per Team - Domani',
        'shop': 'Shop',
        'agents': 'Agenti',
        'total-hours': 'Ore Totali',
        'productivity-trend': 'Trend di Produttività',

        // Users
        'users-title': 'Gestione Utenti',
        'add-new-user': 'Aggiungi Nuovo Utente',
        'full-name': 'Nome Completo',
        'username': 'Nome Utente',
        'contract-hours': 'Ore di Contratto',
        'contract-type': 'Tipo di Contratto',
        'primary-team': 'Team Principale',
        'hire-date': 'Data di Assunzione',
        'active': 'Attivo',
        'actions': 'Azioni',
        'delete': 'Elimina',

        // Planner
        'planner-title': 'Pianificatore',
        'search-agent-placeholder': 'Cerca agente...',
        'select-agents': 'Selezione Intelligente',

        // Productivity
        'productivity-title': 'Produttività',
        'prod-agents-processed': 'Agenti Elaborati',
        'prod-tickets-resolved': 'Ticket Risolti',
        'prod-calls-answered': 'Chiamate Risposte',
        'prod-average': 'Produttività Media',
        'prod-from-xlsx': 'da file XLSX',
        'prod-from-csv': 'da file CSV',
        'prod-formula': '(ticket+chiamate) / ore',
        'prod-days': 'giorni',
        'prod-day': 'giorno',
        'prod-with-data': 'con dati',
        'prod-no-agents': 'Nessun agente trovato. Verifica se il periodo selezionato contiene dati caricati e se gli agenti sono registrati.',
        'prod-upload-to-see': 'Carica i file dalla sezione Upload per vedere i dati.',
        'prod-select-agent': 'Seleziona almeno un agente dalla lista sopra.',
        'prod-no-results': 'Nessun risultato per la selezione corrente.',
        'prod-all-teams': 'Tutti',
        'prod-summary': 'Riepilogo',
        'prod-per-agent': 'Per Agente',
        'prod-all-btn': 'Tutti',
        'prod-none-btn': 'Nessuno',
        'prod-selected': 'selezionati',
        'prod-agents-from-tickets': 'agenti da ticket',
        'prod-agents-from-calls': 'agenti da chiamate',
        'prod-agents-tickets': 'agenti ticket',
        'prod-agents-calls': 'agenti chiamate',
        'prod-no-data-tooltip': 'nessun dato',
        'prod-data-uploaded-for': 'Dati caricati per',
        'prod-can-add-file': 'Puoi aggiungere un altro file o cambiare la data.',
        'prod-date-selected': 'Data selezionata:',
        'prod-can-upload': 'puoi caricare i file.',
        'prod-data-exists': 'esiste già. Il caricamento di nuovi file sovrascriverà i dati esistenti per questo giorno.',
        'prod-data-for': 'I dati per',
        'prod-select-period': 'Seleziona periodo...',
        'prod-search-agent': 'Cerca agente...',
        'prod-save-error': 'Errore nel salvataggio dei dati nel database.',
        'prod-delete-btn': 'Elimina i dati per questo giorno',
        'prod-deleted': 'I dati per {date} sono stati eliminati.',
        'prod-select-date-first': 'Seleziona prima la data dei file!',
        'prod-agents-selected': 'Agenti Selezionati',
        'prod-total-tickets': 'Ticket Totali',
        'prod-total-calls': 'Chiamate Totali',
        'prod-days-with-data': 'giorni con dati',

        // Table headers
        'th-agent': 'Agente',
        'th-teams': 'Team',
        'th-tickets': 'Ticket',
        'th-calls': 'Chiamate',
        'th-total': 'Totale',
        'th-hours-worked': 'Ore Lavorate',
        'th-productivity': 'Produttività',
        'th-date': 'Data',
        'th-schedule': 'Programma',
        'th-hours': 'Ore',

        // Planner
        'planner-agent': 'Agente',
        'planner-hours': 'Ore',
        'planner-total': 'Totale',
        'planner-week-total': 'Tot. Sett.',
        'planner-day-names': 'DOM,LUN,MAR,MER,GIO,VEN,SAB',
        'planner-search-team': 'Cerca team...',
        'planner-search-agent': 'Cerca agente...',
        'planner-select-months': 'Seleziona uno o più mesi da visualizzare.',
        'planner-invalid-range': 'Periodo non valido.',

        // Reports
        'reports-hours-per-shop': 'Ore Pianificate per Shop',
        'reports-distribution': 'Distribuzione Agenti per Shop',
        'reports-shop': 'Shop',
        'reports-total-hours': 'Ore Totali',
        'reports-nr-agents': 'Nr. Agenti',
        'reports-agents-hours': 'agenti',
        'reports-hours-unit': 'ore',
        'reports-select-range': 'Seleziona un intervallo di date per generare i rapporti.',
        'reports-no-data': 'Nessun dato pianificato per l\'intervallo selezionato.',

        // Charts
        'charts-no-data': 'Nessun dato di produttività caricato. Carica i file dalla sezione Upload.',
        'charts-hours-unit': 'ore',

        // Edit Modal
        'edit-title': 'Modifica Selezione',
        'edit-current-selection': 'Selezione Corrente',
        'edit-type-title': 'Tipo di Modifica',
        'edit-working-hours': 'Ore di Lavoro',
        'edit-working-desc': 'Modifica l\'allocazione ore per team (es: 6 IT + 2 HU)',
        'edit-holiday': 'Ferie (CO)',
        'edit-holiday-desc': 'Segna i giorni come ferie',
        'edit-sick': 'Malattia (CM)',
        'edit-sick-desc': 'Segna i giorni come malattia',
        'edit-dayoff': 'Giorno Libero (LB)',
        'edit-dayoff-desc': 'Segna come giorno libero con giustificazione obbligatoria',
        'edit-config-hours': 'Configurazione Ore di Lavoro',
        'edit-total': 'Totale:',
        'edit-hours-unit': 'ore',
        'edit-over-limit': 'Supera il limite di 12 ore',
        'edit-dayoff-reason': 'Giustificazione Giorno Libero',
        'edit-dayoff-placeholder': 'Inserisci il motivo del giorno libero (obbligatorio)...',
        'edit-cancel': 'Annulla',
        'edit-save': 'Salva Modifiche',
        'edit-select-cells': 'Seleziona almeno una cella da modificare.',
        'edit-select-type': 'Seleziona un tipo di modifica.',
        'edit-over-12': 'Il totale delle ore non può superare le 12 ore al giorno.',
        'edit-selection': 'Selezione:',
        'edit-cells-selected': 'celle selezionate',
        'edit-total-hours': 'Ore totali:',

        // Upload
        'upload-title': 'Caricamento File',
        'select-date': '1. Seleziona la data dei file',
        'date-question': 'Per quale giorno sono i dati di produttività?',
        'tickets-xlsx': '2. Ticket (XLSX)',
        'calls-csv': '3. Chiamate (CSV)',
        'drag-xlsx': 'Trascina il file Excel qui o clicca per selezionare',
        'drag-csv': 'Trascina il file CSV qui o clicca per selezionare',
        'uploaded-data': 'Dati Caricati',

        // Reports
        'reports-title': 'Rapporti',

        // Info
        'info-title': 'Informazioni',

        // Login
        'login-button': 'Accedi con Google',
        'logout': 'Disconnetti',

        // Language names
        'language-romanian': 'Rumeno',
        'language-english': 'Inglese',
        'language-italian': 'Italiano',

        // Nav items
        'nav-dashboard': 'Dashboard',
        'nav-users': 'Utenti',
        'nav-planner': 'Pianificatore',
        'nav-productivity': 'Produttività',
        'nav-upload': 'Carica File',
        'nav-reports': 'Rapporti',
        'nav-info': 'Informazioni',
    }
};

// Charts colors configuration
export const chartColors = {
    primary: '#e8a849',
    secondary: '#9a9590',
    grid: '#2e2e2e',
    text: '#9a9590',
    teams: {
        'RO zooplus': '#e8a849',  // Amber
        'HU zooplus': '#5bb98c',  // Green
        'IT zooplus': '#5b9fe8',  // Blue
        'NL zooplus': '#e8915b',  // Orange
        'CS zooplus': '#b07de8',  // Purple
        'SK zooplus': '#e85b8a',  // Pink
        'SV-SE zooplus': '#5bc8d4' // Cyan
    }
};

// Language configuration
export const languageConfig = {
    ro: { flag: '🇷🇴', name: 'Română', code: 'RO' },
    en: { flag: '🇺🇸', name: 'English', code: 'EN' },
    it: { flag: '🇮🇹', name: 'Italiano', code: 'IT' }
};
