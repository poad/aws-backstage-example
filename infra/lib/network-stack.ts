import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import assert from 'assert';

export class NetworkStack extends cdk.Stack {
  public readonly vpc: cdk.aws_ec2.IVpc;
  public readonly lbSg: cdk.aws_ec2.ISecurityGroup;
  public readonly ecsSg: cdk.aws_ec2.ISecurityGroup;
  public readonly dbSg: cdk.aws_ec2.ISecurityGroup;
  public readonly ecsApplicationPort: number;
  public readonly ecsHealthCheckConfig?: cdk.aws_elasticloadbalancingv2.HealthCheck;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const appName = this.node.tryGetContext('appName');
    assert(appName, '');

    const ecsConfig = this.node.tryGetContext('ecs');
    assert(ecsConfig?.applicationPort, '');
    this.ecsApplicationPort = Number.parseInt(ecsConfig.applicationPort);
    this.ecsHealthCheckConfig = ecsConfig.healthCheck;

    const rdbPortString = this.node.tryGetContext('rdbPort');
    assert(rdbPortString, '');
    const rdbPort = Number.parseInt(rdbPortString);

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
      allowAllOutbound: false,
    });
    cdk.Tags.of(lbSg).add('Name', lbSgName);
    this.lbSg = lbSg;

    const ecsSgName = `${appName}-ecs`;
    const ecsSg = new cdk.aws_ec2.SecurityGroup(this, 'EcsSecurityGroup', {
      securityGroupName: ecsSgName,
      vpc,
      allowAllOutbound: true,
    });
    cdk.Tags.of(ecsSg).add('Name', ecsSgName);
    this.ecsSg = ecsSg;

    lbSg.connections.allowFromAnyIpv4(cdk.aws_ec2.Port.HTTP);
    lbSg.connections.allowToAnyIpv4(cdk.aws_ec2.Port.HTTP);

    lbSg.addIngressRule(ecsSg, cdk.aws_ec2.Port.tcp(this.ecsApplicationPort));
    lbSg.addEgressRule(ecsSg, cdk.aws_ec2.Port.tcp(this.ecsApplicationPort));
    ecsSg.addIngressRule(lbSg, cdk.aws_ec2.Port.tcp(this.ecsApplicationPort));

    if (this.ecsHealthCheckConfig?.port) {
      const healthCheckPort = this.ecsHealthCheckConfig.port === 'traffic-port' ? this.ecsApplicationPort : Number.parseInt(this.ecsHealthCheckConfig.port);
      lbSg.addIngressRule(ecsSg, cdk.aws_ec2.Port.tcp(healthCheckPort));
      lbSg.addEgressRule(ecsSg, cdk.aws_ec2.Port.tcp(healthCheckPort));
      ecsSg.addIngressRule(lbSg, cdk.aws_ec2.Port.tcp(healthCheckPort));
      ecsSg.addEgressRule(lbSg, cdk.aws_ec2.Port.tcp(healthCheckPort));
    }

    const dbSgName = `${appName}-database`;
    const dbSg = new cdk.aws_ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      securityGroupName: dbSgName,
      vpc,
      allowAllOutbound: false,
    });
    cdk.Tags.of(dbSg).add('Name', dbSgName);
    this.dbSg = dbSg;
    dbSg.connections.allowFrom(ecsSg, cdk.aws_ec2.Port.tcp(rdbPort));
    dbSg.connections.allowTo(ecsSg, cdk.aws_ec2.Port.tcp(rdbPort));
  }
}
