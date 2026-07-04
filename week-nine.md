# Builder Track Weekly Report — Week 9

**Name:** Emmanuel Badejo
**Week Ending:** 4-07-2026

# Build DApp

## Create a Digital Object Using Spore Protocol

# Create a Digital Object Using Spore Protocol Report

## Overview

Learned how digital objects (DOBs) are created on the CKB blockchain using the Spore Protocol.

Built and ran the Spore tutorial dApp on a local Devnet environment using OffCKB, the Spore SDK, and the CCC JavaScript SDK.

Studied how Spore stores immutable on-chain digital assets inside Spore Cells by encoding both metadata and content directly into the blockchain.

---

## Understanding the Spore Protocol

Learned that Spore is an on-chain Digital Object (DOB) protocol built on CKB for storing immutable digital assets.

Studied how every digital object is represented by a Spore Cell that contains both its metadata and content directly on-chain.

Understood that a Spore Cell stores a content type (such as an image MIME type) together with the binary content of the asset.

Learned that every Spore Cell is immutable after creation, ensuring the integrity and permanence of the stored digital object.

Recognized that Spore Cells utilize Type Scripts for object identification while Lock Scripts determine ownership.

---

## Setting Up the Development Environment

Cloned the Spore tutorial project from the Nervos documentation repository.

Started a local Devnet instance using OffCKB and reviewed the available pre-funded accounts for testing.

Installed all project dependencies and launched the dApp using the Devnet network configuration.

Verified that the application successfully connected to the local blockchain environment through the browser interface.

---

## Creating a Digital Object

Examined the `createSporeDOB` function responsible for creating a new digital object.

Learned how image files are converted into binary data using the browser's `FileReader` API and serialized into a `Uint8Array`.

Studied how a wallet is created from a private key to authorize blockchain transactions.

Constructed a Spore output Cell containing the image's content type and binary content using the Spore SDK.

Learned how the Spore SDK automatically generates the transaction skeleton required to create the digital object.

Signed and broadcast the transaction to successfully store the digital object on-chain.

Captured the generated transaction hash and Spore ID for future retrieval.

---

## Understanding the Spore Cell Structure

Studied the internal structure of a Spore Cell and how it represents an immutable digital object.

Learned that the data field stores the content type, binary content, and optional cluster information.

Understood that the Type Script uniquely identifies the digital object through the Spore ID.

Recognized that ownership is controlled by the Cell's Lock Script while the asset data remains permanently immutable.

---

## Retrieving and Rendering Digital Objects

Examined the `showSporeContent` function used to retrieve an existing digital object.

Learned how to locate a Spore Cell using its transaction hash and output index.

Retrieved the corresponding Live Cell from the blockchain using the CCC client.

Decoded the Spore Cell data into its original content format using the Spore SDK.

Converted the retrieved binary data into a browser `Blob` object.

Generated a temporary object URL to render the stored image directly inside the web application.

Verified that the uploaded image could be successfully reconstructed from blockchain data.

---

## Understanding the Digital Object Lifecycle

Learned that creating a digital object involves producing a new Spore Cell containing immutable asset data.

Studied how the transaction output uniquely represents the digital object through its Spore ID.

Understood that retrieving a digital object requires locating its Live Cell using its transaction outpoint.

Recognized that digital assets stored through the Spore Protocol remain immutable and can be reconstructed entirely from on-chain data.

---

## Deploying to Different Networks

Learned how the dApp can be switched from Devnet to Testnet by changing the `NETWORK` environment variable.

Studied how the same application architecture can be reused across different CKB environments with minimal configuration changes.

Verified that network selection is handled through environment configuration rather than application logic.

---

## Key Findings

* Spore Protocol enables immutable on-chain digital objects on the CKB blockchain.
* Every digital object is stored inside a Spore Cell.
* Spore Cells directly store both the asset's content type and binary content.
* Digital objects become immutable once the Spore Cell is created.
* The Spore SDK simplifies transaction construction for creating digital objects.
* Digital objects can be retrieved by locating their Live Cell using the transaction hash and output index.
* Binary blockchain data can be reconstructed into browser-renderable assets such as images.
* The same Spore application can be deployed across Devnet, Testnet, and Mainnet through simple environment configuration changes.

