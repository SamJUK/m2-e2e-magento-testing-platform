---
'@samjuk/e2e-m2-theme-luma': minor
'@samjuk/e2e-m2-theme-hyva': minor
---

The admin product edit test recovers on retry. A failure between the rename and the restore left the product renamed, and the retry then failed at once on the starting name. **Breaking:** `AdminProductPage.renameProduct` drops its `currentName` argument and is now `renameProduct(searchTerm, newName, storefrontUrl)`. Update any four-argument calls. It renames from whatever name the product has, and the random part of the new name is what proves the rename took.
