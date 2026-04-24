# Presentation Viva Guide

This file is a presentation-ready viva guide for **SecurHealth ML**.  
Every answer is based on the **current implementation in this codebase**, so it is meant to help you give answers that are technically correct and easy to speak aloud.

## 1. Project Overview Chain

### Q1. What is this project?
**Answer:**  
This project is a secure health-record sharing system called **SecurHealth ML**. It combines role-based and attribute-based access control, secure cloud storage, malware scanning, and monitoring so sensitive health records can be shared more safely.

**Likely follow-up:** Why did you build this kind of system?

### Q2. Why did you build this system?
**Answer:**  
I built it because health records are highly sensitive, and ordinary file-sharing systems do not usually combine access control, threat detection, secure deletion, and audit visibility in one place. The goal was to show how machine learning and layered security can improve health-record sharing.

**Likely follow-up:** What exact problem does it solve?

### Q3. What problem does it solve?
**Answer:**  
It solves two main problems. First, it reduces **unauthorized access** by checking role, department, and clearance before a file is released. Second, it reduces **malicious file risk** by scanning uploads before they are stored.

**Likely follow-up:** Why are health records more sensitive than normal files?

### Q4. Why do health records need stronger protection?
**Answer:**  
Health records contain private personal and medical information, so a leak can harm both privacy and trust. In a hospital-style system, even one wrong access or malicious upload can create a serious security issue.

**Likely follow-up:** Who uses your system?

### Q5. Who are the users of this system?
**Answer:**  
The system currently supports admin and clinician-style users, and the policy model also supports roles like radiology, staff, ER, pharmacist, and reporting doctor. In simple terms, admins manage the platform and normal users work with records under policy restrictions.

**Likely follow-up:** Why did you add machine learning to this?

### Q6. Why did you add machine learning?
**Answer:**  
I added machine learning mainly for **PDF malware detection**, because PDFs are a common document format and can contain risky structures like JavaScript or embedded actions. ML gives the project a smarter detection layer beyond only static signatures.

**Likely follow-up:** So does the whole system use AI everywhere?

## 2. Architecture Chain

### Q7. What is the overall architecture of the system?
**Answer:**  
The system has three main parts: a **Next.js app** for the frontend and API layer, **PostgreSQL** for data storage, and a separate **FastAPI ML service** for file scanning. Uploaded files are stored in **AWS S3**.

**Likely follow-up:** Why did you use Next.js for both frontend and backend?

### Q8. Why did you use a single Next.js project?
**Answer:**  
It simplifies development and deployment because the UI and API stay in one project. That made it easier to build a final-year project that still feels like a complete product instead of disconnected services.

**Likely follow-up:** Then what is PostgreSQL used for?

### Q9. What does PostgreSQL store in your project?
**Answer:**  
PostgreSQL stores users, file metadata, ABAC policies, one-time shares, access logs, anomaly events, malware events, MFA state, and admin monitoring data. So the real file content goes to S3, while structured system data stays in the database.

**Likely follow-up:** What is the role of the ML service?

### Q10. What does the ML service do?
**Answer:**  
The ML service scans uploads before storage. For PDFs it uses the trained model plus YARA and ClamAV, while for DOCX, PNG, and JPEG it uses rule-based checks plus YARA and ClamAV.

**Likely follow-up:** Why did you use Docker?

### Q11. Why is Docker used in this project?
**Answer:**  
Docker makes the project portable and easier to run on different machines. It lets the app, database, ML service, and ClamAV start together in a predictable way.

**Likely follow-up:** How does the request flow work from login to file access?

## 3. Authentication And Authorization Chain

### Q12. How does a user log in?
**Answer:**  
The user logs in with email and password. If the credentials are correct, the backend issues a **JWT**, and if MFA is enabled, the user must first complete an email OTP step.

**Likely follow-up:** Why did you use JWT?

### Q13. Why did you use JWT?
**Answer:**  
JWT makes session handling simple for an API-driven web app because the token carries the user identity and role-related claims. In this project, the token includes the user id, email, role, department, and clearance, and it expires after **8 hours**.

**Likely follow-up:** How are passwords protected?

### Q14. How are passwords protected?
**Answer:**  
Passwords are **hashed with bcrypt**, not stored in plain text. In the current implementation, the hashing cost is `12`, which is a standard way to slow down brute-force attacks.

**Likely follow-up:** What is the difference between hashing and encryption?

### Q15. What is the difference between hashing and encryption?
**Answer:**  
Hashing is one-way, so it is used for passwords because the original password should never be recoverable. Encryption is reversible with a key, so it is used when data must be stored securely and later read again.

**Likely follow-up:** What extra security do you have besides password login?

### Q16. What MFA does the system use?
**Answer:**  
The system supports **email OTP MFA** with backup codes. After the password step, an enabled user receives a one-time code by email and can also use a backup code if needed.

**Likely follow-up:** How do you control what each user can access?

### Q17. How do you prevent unauthorized access to files?
**Answer:**  
The system uses **ABAC**, which means access is checked against attributes instead of only a simple role. In this project, the main policy attributes are **role, department, and clearance**.

**Likely follow-up:** What do role, department, and clearance mean?

### Q18. What do role, department, and clearance mean here?
**Answer:**  
Role describes the user type, like clinician or admin. Department describes the organizational unit, like general or radiology. Clearance is the minimum trust level required to access a file.

**Likely follow-up:** So what is the difference between authentication and authorization?

### Q19. What is the difference between authentication and authorization?
**Answer:**  
Authentication means verifying **who the user is**. Authorization means deciding **what that user is allowed to do** after identity is known.

**Likely follow-up:** How is sharing handled securely?

## 4. Storage And Encryption Chain

### Q20. Where are the uploaded files stored?
**Answer:**  
The actual uploaded files are stored in **AWS S3**. The database only stores metadata such as file name, policy, owner, MIME type, size, and the S3 key.

**Likely follow-up:** Are those files encrypted?

### Q21. Are the files encrypted?
**Answer:**  
The system supports **AWS S3 server-side encryption**, but it is **configurable**, not hardcoded as always-on in the code. That means the project can use encrypted storage in S3, but whether it is actively enabled depends on the deployment configuration.

**Likely follow-up:** Which encryption algorithm is used?

### Q22. Which encryption algorithm is used?
**Answer:**  
That answer depends on **which layer** we are talking about. Passwords use **bcrypt hashing**, JWTs are **signed** with a secret using `jsonwebtoken`, and stored files can use **AWS S3 server-side encryption** if `S3_SERVER_SIDE_ENCRYPTION` is configured.

**Likely follow-up:** Can you explain that more clearly by layer?

### Q23. Explain the security algorithms by layer.
**Answer:**  
For passwords, the project uses **bcrypt**, which is hashing, not encryption. For session tokens, the app uses **JWT signing** through `jsonwebtoken`; in practice this uses secret-based signing rather than file encryption. For file storage, the app can pass `S3_SERVER_SIDE_ENCRYPTION` to S3, for example `AES256` or `aws:kms`, but that is deployment-configurable.

**Likely follow-up:** So are passwords encrypted?

### Q24. Are passwords encrypted in your system?
**Answer:**  
No, they are **hashed**, which is better for password storage. The system only checks whether the entered password matches the bcrypt hash.

**Likely follow-up:** What does `S3_SERVER_SIDE_ENCRYPTION` actually mean?

### Q25. What does `S3_SERVER_SIDE_ENCRYPTION` mean?
**Answer:**  
It tells AWS S3 to encrypt the stored object on the server side. If it is set to `AES256`, AWS uses S3-managed encryption, and if it is set to `aws:kms`, AWS KMS is used.

**Likely follow-up:** Why is it important to separate hashing, signing, and encryption?

### Q26. Why do you separate hashing, signing, and encryption?
**Answer:**  
Because they solve different security problems. Hashing protects passwords, signing protects token integrity, and encryption protects stored or transmitted data.

**Likely follow-up:** How does sharing work once the file is stored?

## 5. Malware Detection Chain

### Q27. How do you detect malicious uploads?
**Answer:**  
The system uses a **layered scanner**. PDFs are checked with the trained ML model, YARA, ClamAV, and structural indicators, while DOCX, PNG, and JPEG use rules plus YARA and ClamAV.

**Likely follow-up:** Why is only PDF using AI?

### Q28. Why is only PDF using AI?
**Answer:**  
Because the trained model and dataset in this project are specifically for **PDF malware detection**. For the other supported file types, the project still gives protection, but through rule-based and signature-based scanning instead of a trained classifier.

**Likely follow-up:** Which ML models did you compare?

### Q29. Which machine learning models did you test?
**Answer:**  
I trained and compared **Random Forest** and **XGBoost**. Both performed very strongly, but Random Forest had the best overall held-out test result in this project.

**Likely follow-up:** Why Random Forest and not XGBoost?

### Q30. Why did you choose Random Forest instead of XGBoost?
**Answer:**  
Random Forest was selected because it achieved the best **ROC-AUC** in the saved training results. In this codebase, Random Forest reached about **0.99966 ROC-AUC**, which was slightly better than XGBoost.

**Likely follow-up:** What exactly happens when a malicious file is uploaded?

### Q31. What happens when a malicious file is uploaded?
**Answer:**  
The upload is blocked before the file is stored. The system returns a denial response, records a malware event, and shows the reason in the user flow and admin monitoring.

**Likely follow-up:** How is this different from antivirus only?

### Q32. How is this different from using antivirus alone?
**Answer:**  
Antivirus alone usually depends on signatures. This project combines **ML for PDFs**, **YARA rules**, **ClamAV**, **file-structure checks**, and **access control**, so it has more than one decision layer.

**Likely follow-up:** What file types are supported?

### Q33. Which upload formats are supported?
**Answer:**  
The current supported formats are **PDF, DOCX, PNG, and JPEG**. The project intentionally limits uploads to these types so the scanner behavior stays controlled and explainable.

**Likely follow-up:** How do you prove the PDF model is good?

## 6. Model Evaluation Chain

### Q34. What dataset did you use for the PDF model?
**Answer:**  
The project uses the PDF malware feature dataset saved as `PDFMalware2022.parquet`, and the training metrics file shows **10,023 rows**. The target column is `Class`, and `FileName` was dropped so the model would not learn from an identifier instead of real features.

**Likely follow-up:** How did you split the data?

### Q35. How was the dataset split for training and testing?
**Answer:**  
The saved metrics show **8,018 training rows** and **2,005 test rows**, which is roughly an 80/20 split. That means evaluation was done on unseen test data instead of only training data.

**Likely follow-up:** Which metrics did you use?

### Q36. Which evaluation metrics did you use?
**Answer:**  
The project uses **accuracy, precision, recall, F1-score, and ROC-AUC**. These are standard classification metrics and are also saved in `training_metrics.json`.

**Likely follow-up:** Why is ROC-AUC important?

### Q37. Why is ROC-AUC important in this project?
**Answer:**  
ROC-AUC shows how well the model separates malicious and benign PDFs across thresholds, not just at one fixed cutoff. That makes it especially useful when comparing two strong models like Random Forest and XGBoost.

**Likely follow-up:** What were your real results?

### Q38. What were the actual deployed model results?
**Answer:**  
The deployed model is **Random Forest**. Its saved test results are approximately **99.25% accuracy**, **99.02% precision**, **99.64% recall**, **99.33% F1-score**, and **0.99966 ROC-AUC**.

**Likely follow-up:** What was the confusion matrix?

### Q39. What was the confusion matrix for the deployed model?
**Answer:**  
For Random Forest, the saved confusion matrix is **TN = 883, FP = 11, FN = 4, TP = 1107**. That means the model missed very few malicious files and produced very few false alarms.

**Likely follow-up:** Where is the deployed model stored?

### Q40. Where is the deployed model stored?
**Answer:**  
The trained PDF model is saved as `pdf_malware_model.joblib`, and the ML service loads that file during scanning. So the scanner uses the best saved model, not a retrained model every time.

**Likely follow-up:** What about behavior monitoring beyond malware?

## 7. Anomaly Detection Chain

### Q41. What is the difference between malware logs and anomaly logs?
**Answer:**  
**Malware logs** are about suspicious or malicious files. **Anomaly logs** are about suspicious user or system behavior patterns, like unusual login activity or repeated policy denials.

**Likely follow-up:** How do anomaly logs work in your current version?

### Q42. How do anomaly logs work now?
**Answer:**  
In the current implementation, anomaly logs use a **server-side rule engine**, not an ML model. This is more practical for login and behavior monitoring because the backend already has request IPs, user history, access decisions, and action counts.

**Likely follow-up:** Give examples of login anomalies.

### Q43. What login anomalies can your system detect?
**Answer:**  
The current rules include **new login IP**, **failed password burst for one user**, **password spraying from one IP**, and **successful login after repeated failures**. These events are logged into `anomaly_events` and then shown in the admin view.

**Likely follow-up:** What about file-related anomalies?

### Q44. What file-behavior anomalies can your system detect?
**Answer:**  
The current rules include **repeated ABAC-denied downloads**, **download bursts**, **multiple malware-blocked uploads**, and **share-creation bursts**. These are meant to help admins notice suspicious patterns, even when a single action alone is not enough to prove an attack.

**Likely follow-up:** Why are anomaly logs alerting and not blocking?

### Q45. Why do anomaly logs mostly alert instead of block?
**Answer:**  
Because anomaly logic can create false positives more easily than malware detection. In this version, anomaly events mainly improve monitoring and investigation, while direct blockers are still things like malware detection, auth-risk blocking, and access-control denial.

**Likely follow-up:** So what really blocks a user today?

### Q46. What can actually block a user or action right now?
**Answer:**  
Wrong credentials, failed MFA, ABAC policy denial, malware detection, and scanner-unavailable upload denial can all block access. Anomaly events mostly increase visibility for the admin rather than automatically stopping everything.

**Likely follow-up:** How do you design secure sharing in this system?

## 8. Security Design Chain

### Q47. How does one-time sharing work?
**Answer:**  
The owner or admin can create **one active one-time share** for a file. When the recipient uses that share, the file is consumed and the system destroys it instead of letting the link keep working.

**Likely follow-up:** What do you mean by self-destruct?

### Q48. What does self-destruct mean in your project?
**Answer:**  
It means the file is marked destroyed in the database, the share is consumed, and the stored object is removed from S3. So the system keeps audit history, but the shared file itself is no longer available.

**Likely follow-up:** How is secure deletion handled?

### Q49. What is secure deletion in this system?
**Answer:**  
Secure deletion means the file is removed from **AWS S3**, the database record is marked as destroyed, and active shares are revoked. That keeps history for audit purposes while still removing the usable file.

**Likely follow-up:** How do admins monitor the system?

### Q50. What does the admin dashboard show?
**Answer:**  
The admin dashboard shows summary metrics, detection graphs, recent malware events, recent file activity, anomaly logs, auth failures, and model evaluation results. It is designed as a security-monitoring control panel rather than only a file list.

**Likely follow-up:** What happens if the scanner service goes down?

### Q51. What happens if the security scanner is unavailable?
**Answer:**  
In the current upload path, the system **fails closed**. That means the upload is blocked instead of silently storing an unscanned file.

**Likely follow-up:** How do you prove the system is secure overall?

### Q52. How do you improve security overall in one system?
**Answer:**  
The project combines **bcrypt**, **JWT**, **MFA**, **ABAC**, **AWS S3**, **one-time shares**, **secure deletion**, **audit logs**, **malware scanning**, and **anomaly monitoring**. The main idea is defense in depth rather than depending on a single control.

**Likely follow-up:** Is this production ready?

## 9. Limitations And Future Work Chain

### Q53. Is this production ready for a real hospital?
**Answer:**  
It is a strong **final-year-project prototype**, but I would not describe it as fully hospital-grade production yet. It has many real security ideas, but production use would still need stronger deployment hardening, secrets management, monitoring, compliance work, and operational controls.

**Likely follow-up:** What are the main limitations today?

### Q54. What are the current limitations?
**Answer:**  
The ML model is only for **PDFs**, anomaly detection is **rule-based v1**, there is no mobile app, and some infrastructure concerns still depend on deployment configuration. Also, the system is not yet doing things like geo-IP intelligence, device fingerprinting, or full enterprise SIEM integration.

**Likely follow-up:** What would you improve next?

### Q55. What would you add in the next version?
**Answer:**  
I would expand ML support beyond PDFs, add richer anomaly logic like geo-IP or device fingerprinting, enforce stronger production cloud security defaults, and improve deployment hardening. I would also add more enterprise-style monitoring and possibly broader file-type intelligence.

**Likely follow-up:** What is the main contribution of your project?

### Q56. What is the main contribution of your project?
**Answer:**  
The main contribution is that it combines **secure health-record sharing** with **ABAC**, **AWS-backed storage**, **one-time secure sharing**, **PDF malware detection**, **YARA + ClamAV**, and **anomaly monitoring** in one working system. In short, it shows how AI and layered security can be applied together in a healthcare-style record-sharing platform.

**Likely follow-up:** If the teacher asks for one final summary, what should you say?

### Q57. Give a final one-line summary of the project.
**Answer:**  
SecurHealth ML is a secure health-record sharing platform that uses layered security, ABAC, AWS S3 storage, PDF malware detection, and anomaly monitoring to protect sensitive medical files during upload, sharing, and access.
