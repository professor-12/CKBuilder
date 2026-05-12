# Builder Track Weekly Report — Week 2

**Name:** Emmanuel Badejo
**Week Ending:** 12-05-2026

## Courses & Reading Completed

## Live Cells Exploration

* Explored how **Live Cells** represent the current unspent cells owned by a wallet on the CKB testnet.
* Learned that the total CKB balance of a wallet is calculated from the combined **capacity** of all unlockable live cells associated with that address.
* Observed that each live cell contains a specific amount of storage capacity, represented in hexadecimal format such as `0x2540be400`.
* Understood that newly assigned live cells may take a short delay before appearing after connecting a wallet, requiring the use of the **Fetch Cells** function to refresh the state.
* Interacted with the live cell viewer to inspect cell information and understand how cell data can be represented in JSON format.
* Studied recent testnet blocks and transactions to better understand how transactions are grouped into blocks and recorded on-chain.
* Learned that CKB transactions follow the fundamental structure of **inputs → outputs**, while real transaction objects contain additional metadata and validation fields.
* Reviewed the testnet chain configuration and gained familiarity with several built-in system scripts including:

  * `SECP256K1_BLAKE160` for standard ownership verification.
  * `SECP256K1_BLAKE160_MULTISIG` for multi-signature validation.
  * `DAO` for NervosDAO-related functionality.
* Understood that the `ckt` prefix identifies the Nervos testnet environment rather than mainnet.

## NFT Learning Progress

* Began studying how NFTs are implemented within the Nervos ecosystem, particularly on the CKB Layer 1 network.
* Learned that Nervos operates with a dual-layer architecture:

  * **CKB L1** uses the Cell Model and CKB-VM.
  * **Godwoken L2** uses the EVM model for Ethereum compatibility.
* Explored the differences between Cell Model–based NFT standards and traditional EVM-based NFT standards.
* Learned that the **CoTA NFT standard** offers very low transaction fees compared to many other Layer 1 NFT solutions.
* Studied how the **Spore NFT standard** supports fully on-chain NFT storage, including image data and metadata.
* Understood that Godwoken provides compatibility with popular Ethereum NFT standards such as ERC-721 and ERC-1155.
* Learned that CKB L1 uses a **template-based smart contract model**, allowing developers to reuse existing deployed contracts instead of deploying entirely new contracts for every NFT collection.
* Gained insight into how reusable smart contract templates improve efficiency and reduce deployment complexity on CKB.
* Reviewed the recommendation to build custom NFT standards only after gaining deeper understanding of the Cell Model and CKB smart contract development workflow.
* Became familiar with the importance of existing NFT infrastructure and standards within the Nervos ecosystem before attempting advanced custom implementations.

## NFT Standards Research

* Studied the evolution of NFT standards and how early NFT adoption shaped the blockchain ecosystem.
* Learned about the rise of **CryptoKitties** in 2017 and how its popularity significantly congested the Ethereum network due to scaling limitations.
* Explored the history and purpose of the **ERC-721** NFT standard, which introduced a common framework for unique digital assets.
* Learned how **ERC-1155** improved NFT development by allowing multiple token types to exist within a single smart contract, improving efficiency for developers.
* Gained understanding of how standardized NFT frameworks reduced the need for developers to build NFT logic entirely from scratch.
* Examined the major limitations of early NFT ecosystems, particularly:

  * High transaction and minting costs.
  * Poor scalability during periods of heavy network activity.
  * Weak guarantees around long-term data permanence.
* Learned that Ethereum NFT transactions could become extremely expensive during peak congestion, sometimes costing hundreds of dollars with failed transactions still consuming fees.
* Studied how blockchain state storage contributes to NFT costs due to the requirement for all full nodes to replicate blockchain data.
* Explored the issue of NFT permanence, where many NFTs only store metadata or URLs on-chain while hosting actual image or media content off-chain using services such as IPFS or centralized storage providers.
* Understood the risks associated with off-chain storage, including the possibility of NFT assets becoming inaccessible if hosted content is removed or unavailable.
* Learned how CKB-native NFT standards such as **CoTA** and **Spore** aim to solve these problems through lower fees, better scalability, and support for fully on-chain NFT storage.

## CoTA Standard Exploration

* Studied the **CoTA (Compact Token Aggregator)** NFT standard and its approach to reducing on-chain storage requirements on CKB.
* Learned that CoTA uses **Sparse Merkle Trees (SMTs)** to verify structured off-chain NFT data through compact on-chain proofs.
* Understood how traditional NFT standards often require separate on-chain state entries for each NFT, increasing storage costs over time.
* Explored how CoTA improves scalability by compressing NFT ownership data into a single **32-byte root hash** stored within a CoTA cell.
* Learned that the complete NFT ownership records remain available off-chain while cryptographic proofs are maintained on-chain for verification.
* Gained understanding of how the CoTA framework automatically generates the required proofs and transaction data during NFT transfers.
* Studied the relationship between CoTA cells and state rent on CKB, including the requirement for users to create a CoTA cell before receiving NFTs.
* Learned that the CoTA cell creation process requires a small refundable CKB deposit used to cover future state storage costs.
* Explored how CoTA maintains low transaction fees without sacrificing decentralization or security by leveraging the Nervos CKB architecture.
* Reviewed practical use cases where CoTA’s low-cost model is especially beneficial, including:

  * NFT collectibles and digital art.
  * Gaming assets and in-game items.
  * Event ticketing and POAPs.
  * Tokenization of real-world assets.
* Learned that despite its different underlying architecture, the end-user experience of CoTA NFTs remains similar to standards such as ERC-721 and ERC-1155.

## Spore Standard Exploration

* Studied the **Spore NFT standard** and its approach to fully on-chain NFT storage on Nervos CKB.
* Learned that Spore allows all NFT-related content, including artwork, music, and metadata, to be stored directly on-chain without depending on external hosting providers.
* Understood that unlike CoTA, which aggregates ownership proofs into a single cell, each Spore NFT exists as its own independent cell containing all associated NFT data.
* Explored how fully on-chain storage provides stronger guarantees of:

  * Permanence
  * Immutability
  * Tamper resistance
  * Decentralized availability
* Learned that Spore NFT data is replicated across all full nodes in the network, ensuring long-term accessibility as part of the blockchain state.
* Compared the permanence advantages of Spore NFTs against traditional NFT systems that rely on centralized storage or external services such as IPFS.
* Studied the relationship between storage usage and CKB deposits within the Spore standard, where:

  * 1 CKB corresponds to 1 byte of on-chain storage capacity.
  * Larger NFT data sizes require higher CKB deposits for state rent.
* Learned that the deposited CKB used for storage remains refundable if the NFT is later burned and the storage space is released.
* Explored the tradeoff between decentralization/permanence and storage cost when storing large amounts of NFT data fully on-chain.
* Reviewed several ideal use cases for the Spore standard, including:

  * High-value digital art and collectibles.
  * Fully on-chain pixel art NFTs.
  * Tokenized real estate assets.
  * Tokenized financial assets such as stocks and loans.
* Gained a clearer understanding of how Spore prioritizes permanence and decentralization, while CoTA prioritizes scalability and lower transaction costs.

## Comparing CoTA and Spore Standards

* Studied the architectural and functional differences between the **CoTA** and **Spore** NFT standards on Nervos CKB.
* Learned that both standards are designed around the Cell Model but target different priorities and NFT use cases.
* Compared the cost structures of both standards:

  * **CoTA** focuses on extremely low minting and transfer fees.
  * **Spore** storage costs depend on the amount of NFT data stored fully on-chain.
* Understood that CoTA requires a one-time setup process through the creation of a CoTA cell, while Spore creates a dedicated cell for every NFT.
* Learned that both standards support:

  * Refundable state rent deposits.
  * First-class asset functionality.
  * SDK support for developers.
* Explored the differences in storage architecture:

  * **CoTA** uses Sparse Merkle Trees (SMTs) and off-chain aggregation to reduce on-chain storage usage.
  * **Spore** stores all NFT data directly on-chain without SMT aggregation.
* Gained understanding of how CoTA prioritizes scalability and affordability by minimizing blockchain state usage.
* Learned that Spore prioritizes permanence and decentralized availability through fully on-chain storage.
* Studied how Nervos CKB’s template-based smart contract model reduces deployment costs by allowing developers to reuse existing contract deployments.
* Explored the practical tradeoffs between the two standards:

  * **CoTA** is more suitable for high-volume and low-cost NFT applications.
  * **Spore** is better suited for NFTs requiring maximum permanence and long-term accessibility.
* Developed a clearer understanding of how developers can choose between CoTA and Spore depending on the storage, scalability, and permanence requirements of their projects.
