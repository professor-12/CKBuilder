# Builder Track: Weekly Report (Week 1)

**Name:** Emmanuel Badejo  
**Week ending:** 2 May 2026

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

---

## Second Lesson





## What stuck this week

- CCC gives you one place to start from when wiring a web app to CKB instead of figuring out every piece alone.
- `pnpm create ccc-app my-ccc-app` worked and gave me a React project I could open and poke around in.
- The App and Playground were handy for quick tries before dealing with a full local node.
- **offCKB** for a local CKB node did not work end-to-end yet; I need more time on the errors.

---

## Practical progress

- Ran `pnpm create ccc-app my-ccc-app` and looked through the `my-ccc-app` folder (entry files, config, where scripts live).
- Clicked through scenarios in the CCC App and tried to match what I saw to the theory bits on cells and transactions, though I am still halfway there.
- Changed a few things in the Playground to see what breaks and what passes.
- Tried **offCKB** from the quick-start docs; hit setup/run errors, saved the messages, started reading the troubleshooting parts of the docs.

---

## Environment

- **Node.js** and **pnpm** on **Linux (WSL2)**.
- `**my-ccc-app`** as the main test project.
- **offCKB**: install/run not finished; still debugging.

---

## Progress images

Screenshots of CKB Academy progress and setup are below.

CKB progress 1  
CKB progress 2  
CKB progress 3  
CKB progress 4  
CKB progress 5  
CKB progress 6  
CKB progress 7  
CKB progress 8

---

## Next week

- Get **offCKB** working or follow whatever alternative the docs suggest if I stay stuck.
- Continue the academy theory modules.
- Maybe one short note describing a single transaction path once I understand it better.

