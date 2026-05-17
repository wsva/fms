# API Reference

All API endpoints are prefixed with `/api`. Authenticated endpoints require a valid session cookie (`better-auth.session_token`) obtained by signing in through the OAuth2 flow.

## Domains

| Domain | Description |
|---|---|
| [Authentication](auth.md) | Sign-in, sign-out, session cookie |
| [Cards](cards.md) | Flashcard CRUD, incomplete cards, AI improvement workflow |
| [Books](books.md) | Books, chapters, and sentences |
| [Media](media.md) | File serving, listen media, subtitles |
