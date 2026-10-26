---
'@samjuk/e2e-m2-playwright-core': patch
---

`dockerComposeShell` runs `mariadb` and `mariadb-dump` when the database container has them, and `mysql` and
`mysqldump` otherwise. MariaDB 11 images ship only the `mariadb` names, so seeding against one failed with
exit code 127.
