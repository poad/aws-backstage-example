import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import assert from 'assert';

interface AlbStackProps extends cdk.StackProps {
  vpc: cdk.aws_ec2.IVpc;
  lbSg: cdk.aws_ec2.ISecurityGroup;
  ecsSg: cdk.aws_ec2.ISecurityGroup;
  ecsApplicationPort: number;
  ecsHealthCheckConfig?: cdk.aws_elasticloadbalancingv2.HealthCheck;
}

export class AlbStack extends cdk.Stack {
  public readonly targetGroup: cdk.aws_elasticloadbalancingv2.IApplicationTargetGroup;
  public readonly dnsName: string;
  public readonly alb: cdk.aws_elasticloadbalancingv2.IApplicationLoadBalancer;
  constructor(scope: Construct, id: string, props?: AlbStackProps) {
    super(scope, id, props);

    assert(props, '');
    const appName = this.node.tryGetContext('appName');
    assert(appName, '');

    const {
      vpc,
      lbSg,
      ecsApplicationPort,
      ecsHealthCheckConfig: healthCheck,
    } = props;

    const alb = new cdk.aws_elasticloadbalancingv2.ApplicationLoadBalancer(this, 'ALB', {
      loadBalancerName: appName,
      securityGroup: lbSg,
      vpc,
      vpcSubnets: {
        subnetType: cdk.aws_ec2.SubnetType.PUBLIC,
      },
      http2Enabled: true,
      internetFacing: true,
    });
    this.alb = alb;

    const targetGroup = new cdk.aws_elasticloadbalancingv2.ApplicationTargetGroup(this, 'TargetGroup', {
      vpc,
      targetGroupName: `${appName}-target-group`,
      port: ecsApplicationPort,
      protocol: cdk.aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
      healthCheck,
    });
    this.targetGroup = targetGroup;

    alb.addListener('ALBListener', {
      defaultAction: cdk.aws_elasticloadbalancingv2.ListenerAction.forward([targetGroup]),
      protocol: cdk.aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
    });
    this.dnsName = alb.loadBalancerDnsName;
  }
}
