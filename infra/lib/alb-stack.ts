import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import assert from 'assert';

interface AlbStackProps extends cdk.StackProps {
    vpc: cdk.aws_ec2.IVpc;
    lbSg: cdk.aws_ec2.ISecurityGroup;
    ecsSg: cdk.aws_ec2.ISecurityGroup;
    ecsApplicationPort: number;
    ecsHealthCheckConfig?: {
        port?: number;
        path?: string;
    };
}

export class AlbStack extends cdk.Stack {
    public readonly targetGroup: cdk.aws_elasticloadbalancingv2.IApplicationTargetGroup;
    public readonly dnsName: string;
    constructor(scope: Construct, id: string, props?: AlbStackProps) {
        super(scope, id, props);

        assert(props, '');
        const appName = this.node.tryGetContext('appName');
        assert(appName, '');

        const {
            vpc,
            lbSg,
            ecsApplicationPort,
        } = props;

        const alb = new cdk.aws_elasticloadbalancingv2.ApplicationLoadBalancer(this, 'ALB', {
            securityGroup: lbSg,
            vpc,
            vpcSubnets: {
                subnetType: cdk.aws_ec2.SubnetType.PUBLIC,
            },
        });

        const healthCheck = {}

        const targetGroup = new cdk.aws_elasticloadbalancingv2.ApplicationTargetGroup(this, 'TargetGroup', {
            targetGroupName: `${appName}-target-group`,
            port: ecsApplicationPort,
            healthCheck,
        });
        this.targetGroup = targetGroup;

        alb.addListener('ALBListener', {
            defaultAction: cdk.aws_elasticloadbalancingv2.ListenerAction.forward([targetGroup]),
        });
        this.dnsName = alb.loadBalancerDnsName;
    }
}
