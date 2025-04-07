#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { BaseStack } from '../lib/base-stack';
import { AlbStack } from '../lib/alb-stack';
import { EcsStack } from '../lib/ecs-stack';
import { RdsStack } from '../lib/rds-stack';

const app = new cdk.App();
const region = app.node.tryGetContext('region') ?? (process.env.AWS_REGION ?? 'us-west-2');
const account = app.node.tryGetContext('account');

const base = new BaseStack(app, 'aws-backstage-example-base-stack', {
  env: {
    region,
    account,
  },
});

const alb = new AlbStack(app, 'aws-backstage-example-alb-stack', {
  env: {
    region,
    account,
  },
  vpc: base.vpc,
  lbSg: base.lbSg,
  ecsSg: base.ecsSg,
  ecsApplicationPort: base.ecsApplicationPort,
});
alb.addDependency(base);

const rds = new RdsStack(app, 'aws-backstage-example-rds-stack', {
  env: {
    region,
    account,
  },
  vpc: base.vpc,
  dbSg: base.dbSg,
});
rds.addDependency(base);

const ecs = new EcsStack(app, 'aws-backstage-example-ecs-stack', {
  env: {
    region,
    account,
  },
  vpc: base.vpc,
  targetGroup: alb.targetGroup,
  dnsName: alb.dnsName,
  ecsSg: base.ecsSg,
  ecsApplicationPort: base.ecsApplicationPort,
  ecsHealthCheckConfig: base.ecsHealthCheckConfig,
  ecr: base.ecr,
  secret: rds.secret,

});
ecs.addDependency(rds);

const stacks = [base, alb, ecs, rds];
stacks.forEach((stack) => {
  cdk.Tags.of(stack).add('SubSystem', 'backstage-example');
  cdk.RemovalPolicies.of(stack).destroy();
});
