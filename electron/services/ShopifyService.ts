import { shopifyApi, ApiVersion, GraphqlClient, Session } from "@shopify/shopify-api"

export class ShopifyService {
    private graphql: GraphqlClient;

    constructor(private shopName: string, private accessToken: string) {
        const session = new Session({
            id: `${shopName}-${Date.now()}`,
            shop: `${shopName}.myshopify.com`,
            state: "offline",
            isOnline: false,
            isActive: true,
            accessToken,
        })

        this.graphql = new GraphqlClient({ session })

    }

    async getOrders(limit = 10, cursor?: string) {
        const query = `{ data: 'query { shop { name } }'}`

        const response = await this.graphql.query({
            data: {
                query,
                variables: { first: limit, after: cursor || null },
            },
        });

        console.log(response)
  }
}