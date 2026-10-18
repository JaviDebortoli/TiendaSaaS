import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import gql from 'graphql-tag';
import { ProvisionStoreInput, StoreProvisioningService } from './provisioning.service';

export const provisioningApiExtensions = gql`
  input ProvisionStoreInput {
    "Name of the store. Becomes the Seller name."
    name: String!
    "Channel code: lower case letters, digits and dashes."
    code: String!
    "Channel token for the storefront. Generated when omitted."
    token: String
    "Public https URL of the storefront. Mercado Pago return URLs must belong to it."
    storefrontUrl: String
    ownerEmail: String!
    ownerFirstName: String!
    ownerLastName: String!
    "Generated and returned once when omitted."
    ownerPassword: String
    contactEmail: String
    cuit: String
    logoUrl: String
    "Flat delivery fee in cents (ARS, taxes included)."
    flatRate: Int
    "Minimum order amount in cents for flat-rate delivery."
    flatRateMinimum: Int
  }

  type ProvisionedStore {
    sellerId: ID!
    channelId: ID!
    channelCode: String!
    token: String!
    administratorEmail: String!
    "Only returned when the password was generated. It is not stored anywhere else."
    generatedPassword: String
    stockLocationId: ID!
    shippingMethodIds: [ID!]!
    paymentMethodId: ID!
  }

  extend type Mutation {
    "Creates a store: seller, channel, scoped role and owner, stock location, delivery and payment methods."
    provisionStore(input: ProvisionStoreInput!): ProvisionedStore!
  }
`;

@Resolver()
export class ProvisioningResolver {
  constructor(private readonly provisioning: StoreProvisioningService) {}

  @Mutation()
  @Allow(Permission.SuperAdmin)
  provisionStore(@Ctx() ctx: RequestContext, @Args('input') input: ProvisionStoreInput) {
    return this.provisioning.provision(ctx, input);
  }
}
