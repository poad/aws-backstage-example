import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import assert from 'assert';

export class InfraStack extends cdk.Stack {
  public readonly ecr: cdk.aws_ecr.Repository;
  public readonly vpc: cdk.aws_ec2.IVpc;
  public readonly lbSg: cdk.aws_ec2.ISecurityGroup;
  public readonly ecsSg: cdk.aws_ec2.ISecurityGroup;
  public readonly dbSg: cdk.aws_ec2.ISecurityGroup;
  public readonly ecsApplicationPort: number;
  public readonly ecsHealthCheckConfig?: {
    port?: number;
    path?: string;
  };
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const appName = this.node.tryGetContext('appName');
    assert(appName, '');

    const ecrConfig = this.node.tryGetContext('ecr');
    assert(ecrConfig?.repositoryName, '');

    const ecsConfig = this.node.tryGetContext('ecs');
    assert(ecsConfig?.applicationPort, '');
    this.ecsApplicationPort = Number.parseInt(ecsConfig.applicationPort);
    this.ecsHealthCheckConfig = ecsConfig.healthCheck;

    const rdbPortString = this.node.tryGetContext('rdbPort');
    assert(rdbPortString, '');
    const rdbPort = Number.parseInt(rdbPortString);

    this.ecr = new cdk.aws_ecr.Repository(this, 'Repository', {
      repositoryName: ecrConfig.repositoryName,
      lifecycleRules: [
        {
          tagStatus: cdk.aws_ecr.TagStatus.TAGGED,
          tagPatternList: ['latest'],
          maxImageCount: 1,
          rulePriority: 0,
        },
      ],
    });

    const vpc = cdk.aws_ec2.Vpc.fromLookup(this, 'VPC', {
      vpcName: 'vpc',
      region: this.region,
      ownerAccountId: this.account,
    });
    this.vpc = vpc;

    const lbSgName = `${appName}-alb`;
    const lbSg = new cdk.aws_ec2.SecurityGroup(this, 'LoadBarancerSecurityGroup', {
      securityGroupName: lbSgName,
      vpc,
    });
    cdk.Tags.of(lbSg).add('Name', lbSgName);
    this.lbSg = lbSg;

    const ecsSgName = `${appName}-database`;
    const ecsSg = new cdk.aws_ec2.SecurityGroup(this, 'EcsSecurityGroup', {
      securityGroupName: ecsSgName,
      vpc,
    });
    cdk.Tags.of(ecsSg).add('Name', ecsSgName);
    this.ecsSg = ecsSg;

    lbSg.addIngressRule(ecsSg, cdk.aws_ec2.Port.tcp(this.ecsApplicationPort));
    lbSg.addEgressRule(ecsSg, cdk.aws_ec2.Port.tcp(this.ecsApplicationPort));
    ecsSg.addIngressRule(lbSg, cdk.aws_ec2.Port.tcp(this.ecsApplicationPort));
    ecsSg.addEgressRule(lbSg, cdk.aws_ec2.Port.tcp(this.ecsApplicationPort));

    if (this.ecsHealthCheckConfig?.port) {
      lbSg.addIngressRule(ecsSg, cdk.aws_ec2.Port.tcp(this.ecsHealthCheckConfig.port));
      lbSg.addEgressRule(ecsSg, cdk.aws_ec2.Port.tcp(this.ecsHealthCheckConfig.port));
      ecsSg.addIngressRule(lbSg, cdk.aws_ec2.Port.tcp(this.ecsHealthCheckConfig.port));
      ecsSg.addEgressRule(lbSg, cdk.aws_ec2.Port.tcp(this.ecsHealthCheckConfig.port));
    }

    const dbSgName = `${appName}-database`;
    const dbSg = new cdk.aws_ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      securityGroupName: dbSgName,
      vpc,
    });
    cdk.Tags.of(dbSg).add('Name', dbSgName);
    this.dbSg = dbSg;
    ecsSg.addIngressRule(lbSg, cdk.aws_ec2.Port.tcp(rdbPort));
    ecsSg.addEgressRule(lbSg, cdk.aws_ec2.Port.tcp(rdbPort));
  }
}
