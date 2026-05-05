# Builder Track: Weekly Report (Week 1)

**Name:** Emmanuel Badejo  
**Week ending:** 5 May 2026.

---

## Introduction to the Nervos Blockchain. 

### What I Learnt

- I learnt the basic idea behind the Nervos Blockchain and how it’s structured differently from the usual “everything in one chain” approach.
- I now understand that **CKB (Common Knowledge Base)** is the foundation layer, mainly focused on security and decentralization, while other layers handle speed and scaling.
- I learnt how the multi-layer architecture works basically splitting responsibilities so one layer doesn’t try to do everything.
- I understood that **CKBytes** are not just tokens, but also represent storage on the blockchain. If you store data, your CKBytes get locked, and you get them back when the data is removed.
- I got a basic idea of how development works on Nervos, including the use of common languages and the CKB-VM, though I still need more practice with it.
- I also learnt that Nervos uses Proof of Work through NC-MAX, which is an improved version of the Nakamoto Consensus, aimed at better performance.

---

## First Lesson 

**CKB  basic theoretical course (CKB Academy)**

### What I Learnt

- I learnt that CKB is mainly built around the idea of **cells and how they change over time**.
- I understood that a **cell** is the basic unit on CKB, similar to how UTXOs work in Bitcoin.
- I learnt that every transaction on CKB is just about **consuming old cells and creating new ones**, no matter how complex it looks.
- I now know that **live cells** are unspent, while **dead cells** are already used.
- I learnt that cells can store **any kind of data**, not just transaction info, which makes CKB more flexible than traditional UTXO models.
- I also understood that all these cells together represent the **state of the entire blockchain**.
- I learnt that a **cell contains four main parts: capacity, lock, type, and data**.
- I understood that **capacity** represents the size of the cell, and it is directly tied to CKB tokens (1 CKB = 1 byte of storage).
- I learnt that the **lock script** controls who can use or spend the cell, while the **type script** defines what the cell is used for.
- I understood that the **data field can store any kind of information**, which makes CKB very flexible.
- I learnt that the **total size of everything inside a cell must not exceed its capacity**, meaning storage is limited and must be used carefully.
- I also understood that since storage is tied to tokens, **on-chain space is valuable and not cheap**, which is why CKB is called a “Common Knowledge Base.”
- I learnt about the 2 rules of transactions.

<img width="1315" height="492" alt="image" src="https://github.com/user-attachments/assets/042513d6-4748-4715-b813-34ea42c68eff" />
<img width="1782" height="800" alt="image" src="https://github.com/user-attachments/assets/bc28febd-a5ca-4bfe-818f-cf18597ccbb2" />
<img width="1378" height="688" alt="image" src="https://github.com/user-attachments/assets/ac9880ad-8d99-44fa-af51-838a14a3aa2a" />

---

## Second Lesson
**Connecting to a wallet**
- I learnt how to connect a wallet using MetaMask and interact with the CKB testnet.
- I understood that when a wallet shows a CKB balance, it actually means the total capacity of all the live cells the wallet controls.
- I learnt that I was given 10 live cells, each with a fixed capacity, and I can fetch or view them individually.
- I now understand that live cells are the usable assets, and they determine both my balance and how much storage I have on-chain.
- I learnt that blocks contain transactions, and each transaction still follows the basic idea of inputs → outputs, even if the structure looks more complex.
- I understood that the testnet uses a different address prefix (ckt), which shows it’s not the main network.
- I also learnt that there are built-in scripts (smart contracts) on CKB that handle things like ownership and multi-signature, even if I don’t fully understand them yet.
<img width="1866" height="931" alt="image" src="https://github.com/user-attachments/assets/c6ff2d9d-8aac-4d55-a1c6-6cfdadb3112e" />
<img width="1312" height="619" alt="image" src="https://github.com/user-attachments/assets/f0041315-188b-4af3-9d6f-914631176581" />
<img width="1037" height="615" alt="image" src="https://github.com/user-attachments/assets/fb0ffec6-8eb3-4946-86b3-aaaf961a274a" />
<img width="1845" height="937" alt="image" src="https://github.com/user-attachments/assets/a798f634-2af8-4c4b-a770-4ac0fb8dd218" />
<img width="1864" height="833" alt="image" src="https://github.com/user-attachments/assets/91c7ea56-c705-455b-8afe-4a515999a3ba" />
## I am stuck in trying to sign a transaction still trying to wrap my head around it..



