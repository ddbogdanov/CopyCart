import { shopifyApi, ApiVersion, GraphqlClient, Session } from "@shopify/shopify-api"
import axios from "axios"

export class ShopifyService {

    private session?: Session

    constructor() {
        
    }

    setSession(session: Session) {
        this.session = session
    }

    async fetchOrders(first = 10) {
        if (!this.session) {
            throw new Error("Shopify session not found")
        }

        const query = `
            query {
                orders(first: 10) {
                    edges {
                        cursor
                        node {
                            id
                        }
                    }
                    pageInfo {
                        hasNextPage
                        hasPreviousPage
                        startCursor
                        endCursor
                    }
                }
            }
        `

        try {
            console.log(this.session.accessToken)

            const url = `https://${this.session.shop}/admin/api/2025.10/graphql.json`

            const response = await axios.post(url, JSON.stringify(query), {
                headers: {
                    "X-Shopify-Access-Token": this.session.accessToken,
                    "Content-Type": "application/json",
                },
            });

            return response.data;

            } 
        catch (err: any) {
            console.error("Error fetching orders:", err.response?.data || err.message);
            throw err;
        }
    }
}