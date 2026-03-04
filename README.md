# interactive-books
Βιβλιοθήκη με κοινό book.json και template html, προσθέτω μόνο json για κάθε βιβλίο, όχι html
📚 Interactive Books
Οδηγός Προσθήκης Νέου Βιβλίου
GitHub Repo + Google Sheets Sync
Μέρος Α — Προσθήκη στο Google Sheet

Βήμα 1: Προσθήκη νέου Sheet (Tab)

1
Άνοιξε το Google Spreadsheet σου
Είναι το κεντρικό sheet που συνδέεται με όλα τα βιβλία.

2
Δημιούργησε νέο tab για το βιβλίο
Κλικ στο + κάτω αριστερά για νέο φύλλο.
Δώσε όνομα π.χ. "A_Gymnasiou" (χωρίς κενά).

3
Πρόσθεσε τις στήλες-headers στην 1η γραμμή
number | title | image | videoId | slidesUrl | audioUrl | webUrl | driveUrl | linkUrl | linkName

⚠️ Σημαντικό για τα headers
Τα ονόματα των στηλών πρέπει να είναι ΑΚΡΙΒΩΣ έτσι (πεζά, χωρίς κενά).
Η στήλη "number" είναι υποχρεωτική — χωρίς αυτή δεν αναγνωρίζεται η σελίδα.
Οι υπόλοιπες στήλες είναι προαιρετικές — άδειες κελιά αγνοούνται.

Βήμα 2: Publish το νέο Sheet ως CSV

Αυτό είναι κρίσιμο — κάθε νέο tab πρέπει να γίνει publish ξεχωριστά.

1
File → Share → Publish to web
Άνοιξε το μενού File στο Google Sheets.

2
Επίλεξε το συγκεκριμένο sheet (tab)
Στο dropdown αριστερά επίλεξε ΤΟ ΝΕΟΥ tab (π.χ. A_Gymnasiou).
Στο dropdown δεξιά επίλεξε: Comma-separated values (.csv)

3
Κλικ Publish και αντέγραψε το URL
Θα πάρεις ένα URL της μορφής:
https://docs.google.com/spreadsheets/d/e/...pub?gid=XXXXXXXXX&single=true&output=csv
Το XXXXXXXXX είναι το GID — αυτό χρειάζεσαι!

💡 Πώς βρίσκεις το GID χωρίς Publish
Εναλλακτικά: κλικ στο tab → δες το URL του browser.
Στο τέλος θα γράφει #gid=XXXXXXXXX — αυτός είναι ο αριθμός.

Μέρος Β — Προσθήκη στο GitHub Repo

Τι αρχεία αγγίζεις — Σύνοψη

Αρχείο
Αλλαγή
Υποχρεωτικό;
books.json
Προσθήκη 1 εγγραφής
✅ ΝΑΙ
sync_media.yml
Προσθήκη 1 επιλογής
✅ ΝΑΙ
Νέος φάκελος/data.json
Δημιουργία κενού
✅ ΝΑΙ
index.html (κεντρικό)
Τίποτα
❌ ΟΧΙ
template/index.html
Τίποτα
❌ ΟΧΙ


Βήμα 1: Επεξεργασία books.json

Πρόσθεσε μια νέα εγγραφή στον πίνακα "books":

{
  "id": "A_Gymnasiou",          ← όνομα φακέλου (χωρίς κενά)
  "title": "Α΄ Γυμνασίου",      ← εμφανίζεται στην αρχική σελίδα
  "emoji": "📒",               ← emoji επιλογής σου
  "gid": "XXXXXXXXX",          ← το GID από το Publish URL
  "color": "#8b4513",          ← χρώμα κουμπιού (hex)
  "hoverColor": "#a65d2e",
  "bgColor": "#f5f5dc",
  "textColor": "#2c1810",
  "sidebarBg": "#8b4513"
}

💡 Για τα χρώματα
Μπορείς να αφήσεις τα ίδια χρώματα με τα υπόλοιχα βιβλία αν θες ενιαία εμφάνιση.
Ή άλλαξε το "color" και "sidebarBg" για διαφορετικό χρωματισμό ανά βιβλίο.

Βήμα 2: Επεξεργασία sync_media.yml

Βρες την ενότητα options και πρόσθεσε το νέο βιβλίο:

options:
  - 'A_Lykeiou'
  - 'B_Lykeiou'
  - 'C_Lykeiou'
  - 'B_Gymnasiou'
  - 'A_Gymnasiou'    ← προσθήκη εδώ

Βήμα 3: Δημιουργία νέου φακέλου

Δημιούργησε φάκελο με το ίδιο όνομα που έβαλες στο books.json ("id").
Μέσα στον φάκελο δημιούργησε ένα αρχείο data.json με αυτό το περιεχόμενο:

{
  "pages": []
}

ℹ️ Δεν χρειάζεσαι index.html στον φάκελο!
Το template/index.html φορτώνεται αυτόματα για όλα τα βιβλία.
Το κεντρικό index.html ενημερώνεται αυτόματα από το books.json.
Δεν αγγίζεις αυτά τα 2 αρχεία ποτέ ξανά.

Μέρος Γ — Εκτέλεση Sync

1
Πήγαινε στο GitHub repo σου
Actions → Smart Sync Media per Book

2
Run workflow
Επίλεξε το νέο βιβλίο από το dropdown.
Κλικ Run workflow.

3
Επαλήθευση
Το workflow διαβάζει το GID από books.json.
Κατεβάζει το CSV από το Google Sheet.
Ενημερώνει το data.json στον φάκελο του βιβλίου.
Κάνει αυτόματο commit.

Γρήγορη Αναφορά — Checklist

☐
Google Sheet: Δημιούργησε νέο tab με σωστά headers
☐
Google Sheet: Publish as CSV → αντέγραψε το GID
☐
books.json: Πρόσθεσε νέα εγγραφή με το GID
☐
sync_media.yml: Πρόσθεσε το νέο ID στα options
☐
GitHub: Δημιούργησε φάκελο με data.json = {"pages":[]}
☐
GitHub Actions: Τρέξε το workflow για το νέο βιβλίο
☐
Επαλήθευση: Άνοιξε την αρχική σελίδα — εμφανίζεται το νέο βιβλίο;


🔑 Permissions Υπενθύμιση
Αν το workflow αποτύχει με 'permission denied':
GitHub repo → Settings → Actions → General → Workflow permissions
→ Επίλεξε: Read and write permissions → Save
