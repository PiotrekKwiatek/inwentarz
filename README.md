# Inwentarz hufca (wersja testowa)

Spis sprzętu Karkonoskiego Hufca ZHP: pomieszczenia, pudła i rzeczy z kodami QR, wypożyczenia, zwroty, historia zmian.
To wersja do testów, z przykładowymi danymi.

- Strona: GitHub Pages (ten katalog).
- Baza i logowanie: Firebase (Firestore + logowanie kontem Google).
- `config.js` – ustawienia projektu Firebase (nie są tajne, dostępu pilnują reguły i logowanie).
- `firestore.rules` – reguły dostępu do wklejenia w konsoli Firebase (Firestore → Rules).
- `demo.json` – przykładowe dane, wczytywane przyciskiem w pustej aplikacji.
- `vendor/` – biblioteka Firebase 13.4.0, trzymana tutaj, żeby strona nie zależała od zewnętrznych serwerów.

Aplikacja powstaje jako prototyp w Claude. `index.html` jest z niego budowany automatycznie, więc nie warto go poprawiać ręcznie.
