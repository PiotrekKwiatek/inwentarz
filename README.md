# Wypożyczalnia Hufca – wersja testowa

Wersja do klikania: każdy ma własną kopię przykładowych danych w swojej przeglądarce, nikt nie widzi cudzych zmian.

Adres: https://piotrekkwiatek.github.io/inwentarz/

Prawdziwa aplikacja (konta, wspólna baza, role) jest w repozytorium **wypozyczalnia**: https://piotrekkwiatek.github.io/wypozyczalnia/
Stary adres `/inwentarz/hufiec/` przekierowuje tam automatycznie.

## Pliki

- `index.html` – aplikacja.
- `local.js` – zapis danych w przeglądarce (IndexedDB) zamiast wspólnej bazy.
- `demo.json` – przykładowe dane, daty liczone od dnia otwarcia.
- `manifest.webmanifest`, `icons/`, `sw.js` – instalacja na telefonie i praca bez internetu.
- `vendor/` – biblioteki do kodów QR, PDF i Excela.
