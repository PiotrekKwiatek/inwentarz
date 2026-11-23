# Inwentarz hufca (wersja testowa)

Spis sprzętu Karkonoskiego Hufca ZHP: pomieszczenia, pudła i rzeczy z kodami QR, wypożyczenia, zwroty i historia zmian.

To wersja do testów: każdy, kto otworzy stronę, dostaje własną kopię przykładowych danych zapisaną w swojej przeglądarce.
Zmiany jednej osoby nie są widoczne dla innych. „Zacznij od nowa” (przycisk z inicjałami w prawym górnym rogu) przywraca dane przykładowe.

- `index.html` – aplikacja, budowana automatycznie z prototypu w Claude, więc nie warto jej poprawiać ręcznie.
- `local.js` – zapis danych w przeglądarce (IndexedDB) zamiast wspólnej bazy.
- `demo.json` – przykładowe dane, daty liczone od dnia otwarcia.
- `manifest.webmanifest`, `icons/`, `sw.js` – instalacja na telefonie (ikona na ekranie początkowym) i praca bez internetu.
- `vendor/` – biblioteki do kodów QR, PDF i Excela, trzymane tutaj, żeby działały bez internetu.

## Wersja z kontami (`hufiec/`)

Adres: `/inwentarz/hufiec/`. Logowanie mailem i hasłem (Firebase Authentication), wspólna baza (Firestore) i trzy role nadawane po adresie e-mail:
admin (wszystko + lista użytkowników), biuro hufca (wydawanie, zwroty, wnioski), drużynowy/instruktor (spis „dostępne/niedostępne” i wnioski o sprzęt).

- `hufiec/config.js` – ustawienia projektu Firebase.
- `hufiec/firestore.rules` – reguły dostępu do wklejenia w Firestore → Reguły (w miejsce OWNER_EMAIL wpisz mail pierwszego admina).
- `hufiec/fb.js` – logowanie, role i połączenie z bazą; `hufiec/prod.js` – widok drużynowego, wnioski, panel użytkowników.
